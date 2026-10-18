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
 * Token getter for this machine's managed identity: the system-assigned one,
 * or the user-assigned one with `clientId`. One MSAL app per identity, kept
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
