/**
 * How PatchPilot's confidential client proves its identity to Entra — see
 * packages/graph/src/credential.ts. "secret" is the original (and still
 * default) mode; a paired instance switches to "certificate" via the
 * `entra-app-registration` settings row load-env.ts reads at boot.
 */
export const ENTRA_CREDENTIAL_TYPES = ["secret", "certificate"] as const;
export type EntraCredentialType = (typeof ENTRA_CREDENTIAL_TYPES)[number];

/**
 * The env fields that together make up the credential for each type, on top
 * of ENTRA_TENANT_ID/ENTRA_CLIENT_ID which every type needs. Shared by
 * apps/api/src/config.ts and packages/graph/src/env.ts so their "set
 * together, or not at all" checks can't drift.
 */
export const ENTRA_CREDENTIAL_FIELDS = {
  secret: ["ENTRA_CLIENT_SECRET"],
  certificate: ["ENTRA_CERTIFICATE_PRIVATE_KEY", "ENTRA_CERTIFICATE_THUMBPRINT_SHA256"],
} as const satisfies Record<EntraCredentialType, readonly string[]>;

/** What Setup -> App Registration shows about the live credential. Never carries key material. */
export interface EntraCredentialSummary {
  type: EntraCredentialType;
  /** Certificate only: ISO timestamp the certificate stops being valid. */
  expiresAt?: string;
  /** Certificate only: uppercase hex SHA-256 thumbprint, as shown in Entra's "Certificates & secrets". */
  thumbprintSha256?: string;
}
