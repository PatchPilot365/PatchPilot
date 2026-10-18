/**
 * How PatchPilot's confidential client proves its identity to Entra — see
 * packages/graph/src/credential.ts. "secret" is the original (and still
 * default) mode; a paired instance switches to "certificate" or
 * "managed-identity" via the `entra-app-registration` settings row
 * load-env.ts reads at boot.
 */
export const ENTRA_CREDENTIAL_TYPES = ["secret", "certificate", "managed-identity"] as const;
export type EntraCredentialType = (typeof ENTRA_CREDENTIAL_TYPES)[number];

/**
 * The env fields that together make up the credential for each type, on top
 * of ENTRA_TENANT_ID/ENTRA_CLIENT_ID which every type needs. Shared by
 * apps/api/src/config.ts and packages/graph/src/env.ts so their "set
 * together, or not at all" checks can't drift. A managed identity needs
 * nothing extra: ENTRA_MANAGED_IDENTITY_CLIENT_ID is only for a
 * user-assigned identity, and the VM's system-assigned one needs no ID.
 */
export const ENTRA_CREDENTIAL_FIELDS = {
  secret: ["ENTRA_CLIENT_SECRET"],
  certificate: ["ENTRA_CERTIFICATE_PRIVATE_KEY", "ENTRA_CERTIFICATE_THUMBPRINT_SHA256"],
  "managed-identity": [],
} as const satisfies Record<EntraCredentialType, readonly string[]>;

/** The env fields that name a credential kept in Azure Key Vault instead. */
export const ENTRA_KEY_VAULT_FIELDS = {
  secret: ["ENTRA_KEY_VAULT_URL", "ENTRA_KEY_VAULT_SECRET_NAME"],
  certificate: ["ENTRA_KEY_VAULT_URL", "ENTRA_KEY_VAULT_CERTIFICATE_NAME"],
} as const;

export type EntraCredentialSource = "local" | "key-vault";

interface EntraCredentialEnv {
  ENTRA_CREDENTIAL_TYPE: EntraCredentialType;
  ENTRA_KEY_VAULT_SECRET_NAME?: string;
  ENTRA_KEY_VAULT_CERTIFICATE_NAME?: string;
}

/**
 * Key Vault is in use when the operator named a secret (type "secret") or a
 * certificate (type "certificate") in it. Key Vault settings win over a
 * paired credential of the same type: they're an explicit operator choice
 * made after pairing.
 */
export function entraCredentialSource(e: EntraCredentialEnv): EntraCredentialSource {
  if (e.ENTRA_CREDENTIAL_TYPE === "secret" && e.ENTRA_KEY_VAULT_SECRET_NAME) return "key-vault";
  if (e.ENTRA_CREDENTIAL_TYPE === "certificate" && e.ENTRA_KEY_VAULT_CERTIFICATE_NAME) return "key-vault";
  return "local";
}

/** The credential fields the "set together, or not at all" check applies to. */
export function entraCredentialFields(e: EntraCredentialEnv): readonly string[] {
  if (entraCredentialSource(e) === "key-vault") {
    return ENTRA_KEY_VAULT_FIELDS[e.ENTRA_CREDENTIAL_TYPE as "secret" | "certificate"];
  }
  return ENTRA_CREDENTIAL_FIELDS[e.ENTRA_CREDENTIAL_TYPE];
}

/** What Setup -> App Registration shows about the live credential. Never carries key material. */
export interface EntraCredentialSummary {
  type: EntraCredentialType;
  /** "key-vault" when the secret or certificate is kept in Azure Key Vault; omitted otherwise. */
  source?: "key-vault";
  /** Certificate only: ISO timestamp the certificate stops being valid. */
  expiresAt?: string;
  /** Certificate only: uppercase hex SHA-256 thumbprint, as shown in Entra's "Certificates & secrets". */
  thumbprintSha256?: string;
}
