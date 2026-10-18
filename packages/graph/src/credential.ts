import type { NodeAuthOptions } from "@azure/msal-node";
import type { EntraCredentialSummary } from "@patchpilot/shared";
import { X509Certificate } from "node:crypto";
import type { GraphEnv } from "./env.js";
import { env } from "./env.js";

/**
 * The one place that decides how PatchPilot's confidential client proves its
 * identity to Entra. Every MSAL flow (login code redemption, OBO, customer
 * tenant refresh-token redemption) is built from msal.ts's getMsalConfig(),
 * which spreads this in — so adding a credential type means touching only
 * this function, env.ts/config.ts's field lists and load-env.ts.
 *
 * - "secret": the original bearer client secret.
 * - "certificate": an instance-generated RSA key pair (see x509.ts and
 *   routes/onboarding-pairing.ts). MSAL signs a short-lived client assertion
 *   with the private key on every token request, so nothing replayable ever
 *   leaves the server; the key itself never crosses the wire at pairing.
 *
 * Read live from `env` (no caching) for the same post-pairing reconciliation
 * reason getMsalConfig() itself is built per call.
 */
export function getMsalCredential(
  e: Pick<
    GraphEnv,
    "ENTRA_CREDENTIAL_TYPE" | "ENTRA_CLIENT_SECRET" | "ENTRA_CERTIFICATE_PRIVATE_KEY" | "ENTRA_CERTIFICATE_THUMBPRINT_SHA256"
  > = env,
): Pick<NodeAuthOptions, "clientSecret" | "clientCertificate"> {
  switch (e.ENTRA_CREDENTIAL_TYPE) {
    case "certificate":
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

/**
 * Non-secret description of a stored credential for Setup -> App Registration.
 * Takes the public certificate PEM (kept alongside the encrypted key in the
 * `entra-app-registration` settings row) rather than anything from env, so the
 * expiry shown is the certificate's own notAfter, not a value someone typed.
 */
export function describeEntraCredential(row: {
  credentialType?: "secret" | "certificate";
  certificatePem?: string;
}): EntraCredentialSummary {
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
