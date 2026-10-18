import type { ClientAssertionCallback, NodeAuthOptions } from "@azure/msal-node";
import { entraCredentialSource, type EntraCredentialSummary, type EntraCredentialType } from "@patchpilot/shared";
import { createHash, randomUUID, X509Certificate } from "node:crypto";
import type { GraphEnv } from "./env.js";
import { env } from "./env.js";
import {
  getKeyVaultCertificate,
  managedIdentityTokenGetter,
  signDigestWithKeyVault,
  type KeyVaultCertificate,
  type TokenGetter,
} from "./keyvault.js";

/**
 * The one place that decides how PatchPilot's confidential client proves its
 * identity to Entra. Every MSAL flow (login code redemption, OBO, customer
 * tenant refresh-token redemption) is built from msal.ts's getMsalConfig(),
 * which spreads this in — so adding a credential type means touching only
 * this function, env.ts/config.ts's field lists and load-env.ts.
 *
 * - "secret": the original bearer client secret. With
 *   ENTRA_KEY_VAULT_SECRET_NAME set, load-env.ts fetches it from Key Vault at
 *   boot instead of reading it from `.env` or the paired row.
 * - "certificate": an instance-generated RSA key pair (see x509.ts and
 *   routes/onboarding-pairing.ts). MSAL signs a short-lived client assertion
 *   with the private key on every token request, so nothing replayable ever
 *   leaves the server; the key itself never crosses the wire at pairing.
 *   With ENTRA_KEY_VAULT_CERTIFICATE_NAME set, the key stays in Key Vault
 *   (non-exportable) and Key Vault signs the assertion instead.
 * - "managed-identity": the Azure VM's managed identity, registered on the
 *   app as a federated identity credential. The assertion is a managed
 *   identity token for api://AzureADTokenExchange, so the server stores no
 *   credential at all.
 *
 * Read live from `env` (no caching) for the same post-pairing reconciliation
 * reason getMsalConfig() itself is built per call.
 */
export function getMsalCredential(
  e: Pick<
    GraphEnv,
    | "ENTRA_CREDENTIAL_TYPE"
    | "ENTRA_CLIENT_SECRET"
    | "ENTRA_CERTIFICATE_PRIVATE_KEY"
    | "ENTRA_CERTIFICATE_THUMBPRINT_SHA256"
    | "ENTRA_MANAGED_IDENTITY_CLIENT_ID"
    | "ENTRA_KEY_VAULT_URL"
    | "ENTRA_KEY_VAULT_SECRET_NAME"
    | "ENTRA_KEY_VAULT_CERTIFICATE_NAME"
  > = env,
  getToken: TokenGetter = managedIdentityTokenGetter(e.ENTRA_MANAGED_IDENTITY_CLIENT_ID || undefined),
): Pick<NodeAuthOptions, "clientSecret" | "clientCertificate" | "clientAssertion"> {
  switch (e.ENTRA_CREDENTIAL_TYPE) {
    case "managed-identity":
      return { clientAssertion: managedIdentityAssertion(getToken) };
    case "certificate":
      if (entraCredentialSource(e) === "key-vault") {
        return {
          clientAssertion: keyVaultCertificateAssertion(
            e.ENTRA_KEY_VAULT_URL,
            e.ENTRA_KEY_VAULT_CERTIFICATE_NAME,
            getToken,
          ),
        };
      }
      return {
        clientCertificate: {
          thumbprintSha256: e.ENTRA_CERTIFICATE_THUMBPRINT_SHA256,
          privateKey: e.ENTRA_CERTIFICATE_PRIVATE_KEY,
        },
      };
    case "secret":
      return { clientSecret: e.ENTRA_CLIENT_SECRET };
  }
}

/** Audience Entra requires on a managed identity token used as a federated credential (public cloud). */
const FEDERATED_CREDENTIAL_RESOURCE = "api://AzureADTokenExchange";

/**
 * MSAL calls this on every token request. The managed identity app behind
 * `getToken` caches its token, so this is a local lookup almost every time.
 */
export function managedIdentityAssertion(getToken: TokenGetter): ClientAssertionCallback {
  return () => getToken(FEDERATED_CREDENTIAL_RESOURCE);
}

/** Entra accepts client assertions valid for up to 10 minutes. */
const ASSERTION_LIFETIME_SECONDS = 600;
/** Re-sign this long before an assertion expires, so one never arrives stale. */
const ASSERTION_REUSE_MARGIN_SECONDS = 120;
/** How long a looked-up Key Vault certificate version is trusted before checking for a renewal. */
const CERTIFICATE_LOOKUP_TTL_MS = 60 * 60 * 1000;

/**
 * Builds the same RS256 client assertion MSAL builds for a local certificate,
 * with the signing step supplied by the caller — here, Key Vault, so the key
 * never leaves the vault. `audience` is the token endpoint of the authority
 * being called, which differs per customer tenant.
 */
export async function buildClientAssertion(opts: {
  clientId: string;
  audience: string;
  x5tS256: string;
  signDigest: (digest: Buffer) => Promise<Buffer>;
  now?: Date;
}): Promise<string> {
  const iat = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  const header = { alg: "RS256", typ: "JWT", "x5t#S256": opts.x5tS256 };
  const payload = {
    aud: opts.audience,
    iss: opts.clientId,
    sub: opts.clientId,
    jti: randomUUID(),
    iat,
    nbf: iat,
    exp: iat + ASSERTION_LIFETIME_SECONDS,
  };
  const signingInput = [header, payload]
    .map((part) => Buffer.from(JSON.stringify(part)).toString("base64url"))
    .join(".");
  const signature = await opts.signDigest(createHash("sha256").update(signingInput).digest());
  return `${signingInput}.${signature.toString("base64url")}`;
}

// Module-level, not per callback: getMsalConfig() builds a fresh callback on
// every call, and these caches have to outlive that.
const certificateLookups = new Map<string, { at: number; cert: Promise<KeyVaultCertificate> }>();
const signedAssertions = new Map<string, { exp: number; jwt: string }>();

/**
 * Client assertion signed by a Key Vault certificate's key. At most one Key
 * Vault sign call per authority every ~8 minutes: a signed assertion is
 * reused until close to its expiry. A renewed certificate (a new version in
 * the vault) is picked up within an hour; until then the previous version
 * keeps signing, so keep it registered on the app until the switch.
 */
export function keyVaultCertificateAssertion(
  vaultUrl: string,
  certificateName: string,
  getToken: TokenGetter,
  fetchImpl?: typeof fetch,
): ClientAssertionCallback {
  const deps = { getToken, fetch: fetchImpl };
  const lookupKey = `${vaultUrl}|${certificateName}`;
  return async ({ clientId, tokenEndpoint }) => {
    if (!tokenEndpoint) throw new Error("MSAL did not supply a token endpoint for the client assertion");
    const now = Math.floor(Date.now() / 1000);
    const assertionKey = `${lookupKey}|${clientId}|${tokenEndpoint}`;
    const reusable = signedAssertions.get(assertionKey);
    if (reusable && reusable.exp - ASSERTION_REUSE_MARGIN_SECONDS > now) return reusable.jwt;

    let lookup = certificateLookups.get(lookupKey);
    if (!lookup || Date.now() - lookup.at > CERTIFICATE_LOOKUP_TTL_MS) {
      const fresh = { at: Date.now(), cert: getKeyVaultCertificate(vaultUrl, certificateName, deps) };
      certificateLookups.set(lookupKey, fresh);
      // A failed lookup isn't kept: the next token request tries again.
      fresh.cert.catch(() => {
        if (certificateLookups.get(lookupKey) === fresh) certificateLookups.delete(lookupKey);
      });
      lookup = fresh;
    }
    const cert = await lookup.cert;
    const jwt = await buildClientAssertion({
      clientId,
      audience: tokenEndpoint,
      x5tS256: cert.x5tS256,
      signDigest: (digest) => signDigestWithKeyVault(cert.keyId, digest, deps),
    });
    signedAssertions.set(assertionKey, { exp: now + ASSERTION_LIFETIME_SECONDS, jwt });
    return jwt;
  };
}

/**
 * Non-secret description of a stored credential for Setup -> App Registration.
 * Takes the public certificate PEM (kept alongside the encrypted key in the
 * `entra-app-registration` settings row) rather than anything from env, so the
 * expiry shown is the certificate's own notAfter, not a value someone typed.
 */
export function describeEntraCredential(row: {
  credentialType?: EntraCredentialType;
  certificatePem?: string;
}): EntraCredentialSummary {
  if (row.credentialType === "managed-identity") return { type: "managed-identity" };
  if (row.credentialType !== "certificate" || !row.certificatePem) return { type: "secret" };
  try {
    const cert = new X509Certificate(row.certificatePem);
    return {
      type: "certificate",
      expiresAt: new Date(cert.validTo).toISOString(),
      thumbprintSha256: cert.fingerprint256.replace(/:/g, ""),
    };
  } catch {
    return { type: "certificate" };
  }
}
