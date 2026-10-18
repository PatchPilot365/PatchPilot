import { ManagedIdentityApplication } from "@azure/msal-node";
import { createHash } from "node:crypto";

/**
 * Azure managed identity and Key Vault access for the opt-in Azure credential
 * modes (see credential.ts). Plain REST over `fetch` rather than the Azure
 * SDKs: three Key Vault calls don't justify @azure/keyvault-* and
 * @azure/identity in the supply chain, and MSAL Node (already a dependency)
 * covers the managed identity token itself.
 *
 * Deliberately imports nothing from env.ts: apps/api and apps/worker's
 * load-env.ts import this module (as `@patchpilot/graph/keyvault`) to fetch a
 * Key Vault secret at boot, before the env singleton can be trusted — see
 * the matching comment on decryptPairedSecret there.
 */

/** Gets an access token for `resource` (no "/.default") from a managed identity. */
export type TokenGetter = (resource: string) => Promise<string>;

/** Public-cloud Key Vault resource. Sovereign clouds aren't supported. */
const KEY_VAULT_RESOURCE = "https://vault.azure.net";
const KEY_VAULT_API_VERSION = "7.4";

const managedIdentityApps = new Map<string, ManagedIdentityApplication>();

/**
 * Token getter for this machine's managed identity: the user-assigned one
 * with `clientId`, else the system-assigned one (enough for reading Key
 * Vault, but Entra only accepts a user-assigned identity as an app's
 * federated credential). One MSAL app per identity, kept
 * for the life of the process because it caches tokens until shortly before
 * they expire — calling this per token request costs nothing extra.
 */
export function managedIdentityTokenGetter(clientId?: string): TokenGetter {
  return async (resource) => {
    const cacheKey = clientId ?? "";
    let app = managedIdentityApps.get(cacheKey);
    if (!app) {
      app = new ManagedIdentityApplication(
        clientId ? { managedIdentityIdParams: { userAssignedClientId: clientId } } : undefined,
      );
      managedIdentityApps.set(cacheKey, app);
    }
    const result = await app.acquireToken({ resource });
    return result.accessToken;
  };
}

export interface KeyVaultDeps {
  getToken: TokenGetter;
  fetch?: typeof fetch;
}

/** `https://<name>.vault.azure.net` with no trailing slash, or a thrown error. */
export function normalizeVaultUrl(vaultUrl: string): string {
  const url = new URL(vaultUrl);
  if (url.protocol !== "https:") throw new Error("ENTRA_KEY_VAULT_URL must be an https:// URL");
  return url.origin;
}

async function keyVaultRequest<T>(
  url: string,
  deps: KeyVaultDeps,
  init?: { method: "POST"; body: unknown },
): Promise<T> {
  const token = await deps.getToken(KEY_VAULT_RESOURCE);
  const res = await (deps.fetch ?? fetch)(url, {
    method: init?.method ?? "GET",
    headers: {
      authorization: `Bearer ${token}`,
      ...(init ? { "content-type": "application/json" } : {}),
    },
    body: init ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    // Key Vault's error body names the problem (e.g. "Forbidden: caller is
    // not authorized") and never echoes the secret, so it's safe to surface.
    const detail = await res.text().catch(() => "");
    throw new Error(`Key Vault request failed: ${res.status} ${detail.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/** The current version of a Key Vault secret. Needs "Key Vault Secrets User" on the vault. */
export async function getKeyVaultSecret(vaultUrl: string, name: string, deps: KeyVaultDeps): Promise<string> {
  const base = normalizeVaultUrl(vaultUrl);
  const body = await keyVaultRequest<{ value?: string }>(
    `${base}/secrets/${encodeURIComponent(name)}?api-version=${KEY_VAULT_API_VERSION}`,
    deps,
  );
  if (!body.value) throw new Error(`Key Vault secret ${name} has no value`);
  return body.value;
}

export interface KeyVaultCertificate {
  /** Versioned key ID (`<vault>/keys/<name>/<version>`) that signs for this certificate. */
  keyId: string;
  /** Base64url SHA-256 of the certificate DER — the JWT `x5t#S256` header. */
  x5tS256: string;
}

/**
 * The current version of a Key Vault certificate: its public part and the ID
 * of the (non-exportable) key that signs for it. Needs "Key Vault
 * Certificate User" (to read the certificate) and "Key Vault Crypto User"
 * (to sign) on the vault. The private key itself is never read.
 */
export async function getKeyVaultCertificate(
  vaultUrl: string,
  name: string,
  deps: KeyVaultDeps,
): Promise<KeyVaultCertificate> {
  const base = normalizeVaultUrl(vaultUrl);
  const body = await keyVaultRequest<{ kid?: string; cer?: string }>(
    `${base}/certificates/${encodeURIComponent(name)}?api-version=${KEY_VAULT_API_VERSION}`,
    deps,
  );
  if (!body.kid || !body.cer) throw new Error(`Key Vault certificate ${name} has no key or certificate`);
  // The sign request below carries the vault token, so it must go to the
  // vault we were configured with, never wherever the response points.
  if (new URL(body.kid).origin !== base) throw new Error(`Key Vault certificate ${name} points outside ${base}`);
  return {
    keyId: body.kid,
    x5tS256: createHash("sha256").update(Buffer.from(body.cer, "base64")).digest("base64url"),
  };
}

/** RS256-signs a SHA-256 digest with a Key Vault key. Returns the raw signature. */
export async function signDigestWithKeyVault(keyId: string, digest: Buffer, deps: KeyVaultDeps): Promise<Buffer> {
  const body = await keyVaultRequest<{ value?: string }>(`${keyId}/sign?api-version=${KEY_VAULT_API_VERSION}`, deps, {
    method: "POST",
    body: { alg: "RS256", value: digest.toString("base64url") },
  });
  if (!body.value) throw new Error("Key Vault sign returned no signature");
  return Buffer.from(body.value, "base64url");
}

export interface DetectedManagedIdentity {
  /** Object (principal) ID — the federated credential's subject. */
  objectId: string;
  /** Directory the identity lives in. */
  tenantId: string;
}

export interface DetectManagedIdentityOptions {
  /** A user-assigned identity's client ID; omit for the machine's only identity. */
  clientId?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const IMDS_TOKEN_URL = "http://169.254.169.254/metadata/identity/oauth2/token";
const DETECTION_CACHE_MS = 10 * 60_000;
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const detectionCache = new Map<string, { at: number; result: DetectedManagedIdentity | null }>();

/**
 * Whether this machine is an Azure VM with a managed identity, and if so
 * which one — so a pairing script downloaded from it can register that
 * identity instead of a certificate. Asks IMDS directly rather than through
 * MSAL's ManagedIdentityApplication, whose retries would make every probe
 * off Azure take many seconds; here an unreachable 169.254.169.254 costs at
 * most `timeoutMs`, once per cache window.
 *
 * The token's payload is decoded but not verified: it only pre-fills the
 * pairing script, which the admin runs against their own tenant, and the
 * script still checks the tenant matches before using it. Never throws —
 * anything unexpected means "no managed identity".
 */
export async function detectManagedIdentity(
  options: DetectManagedIdentityOptions = {},
): Promise<DetectedManagedIdentity | null> {
  const cacheKey = options.clientId ?? "";
  const cached = detectionCache.get(cacheKey);
  if (cached && Date.now() - cached.at < DETECTION_CACHE_MS) return cached.result;

  let result: DetectedManagedIdentity | null = null;
  try {
    const url = new URL(IMDS_TOKEN_URL);
    url.searchParams.set("api-version", "2018-02-01");
    url.searchParams.set("resource", "api://AzureADTokenExchange");
    if (options.clientId) url.searchParams.set("client_id", options.clientId);
    const res = await (options.fetch ?? fetch)(url, {
      headers: { Metadata: "true" },
      signal: AbortSignal.timeout(options.timeoutMs ?? 2000),
    });
    if (res.ok) {
      const body = (await res.json()) as { access_token?: unknown };
      const payload = typeof body.access_token === "string" ? body.access_token.split(".")[1] : undefined;
      if (payload) {
        const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
          oid?: unknown;
          tid?: unknown;
        };
        if (
          typeof claims.oid === "string" &&
          typeof claims.tid === "string" &&
          GUID_RE.test(claims.oid) &&
          GUID_RE.test(claims.tid)
        ) {
          result = { objectId: claims.oid, tenantId: claims.tid };
        }
      }
    }
  } catch {
    result = null;
  }
  detectionCache.set(cacheKey, { at: Date.now(), result });
  return result;
}

/** Test-only: forget cached detection results. */
export function clearManagedIdentityDetectionCache(): void {
  detectionCache.clear();
}
