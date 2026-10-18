import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createDecipheriv, createHash } from "node:crypto";

/**
 * Loads the repo-root `.env` into process.env BEFORE any config is read.
 *
 * Host dev (`pnpm dev`) runs each app with its own cwd and injects no
 * environment, so without this the worker never sees DATABASE_URL/REDIS_URL and
 * silently falls back to demo defaults. Docker Compose injects env directly (and
 * the file may be absent in the container), hence the existence guard. Node does
 * not overwrite already-set vars, so shell/Compose values take precedence over
 * the file. Import this FIRST in the process entrypoint.
 *
 * Also injects a paired Entra app registration if one exists (see
 * apps/api/src/routes/onboarding-pairing.ts) — keeps the worker's own
 * @patchpilot/graph auth calls consistent with the API after a pairing/restart,
 * without waiting on any cross-process signal beyond the shared DB row.
 * Precedence: paired DB row > ENTRA_* env/`.env` values > demo placeholders.
 */
function loadRootEnv(): void {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      const envPath = join(dir, ".env");
      if (existsSync(envPath)) {
        (process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile(envPath);
      }
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}

loadRootEnv();

// AES-256-GCM decrypt, duplicated from packages/graph/src/crypto.ts (must stay
// byte-compatible with its encrypt()) rather than imported: that package's
// env.ts validates ENTRA_* eagerly at import time and would throw on a freshly
// paired instance's first boot, before this module has had a chance to set
// them below. @patchpilot/db is safe to import here — its connection pool is
// lazy (packages/db/src/client.ts) and touches no env until a query runs.
function decryptPairedSecret(payload: string, keySource: string): string {
  const key = createHash("sha256").update(keySource).digest();
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

async function loadPairedEntraCredentials(): Promise<void> {
  // Mirrors apps/api/src/config.ts's own DEMO_MODE parsing (default true)
  // without importing anything that validates ENTRA_* eagerly.
  if ((process.env.DEMO_MODE ?? "true") !== "false") return;

  try {
    const { db, tables, eq } = await import("@patchpilot/db");
    const [row] = await db
      .select()
      .from(tables.settings)
      .where(eq(tables.settings.key, "entra-app-registration"));
    if (!row) return;

    // credentialType is absent on every row written before certificate
    // pairing existed — those are all client secrets. The row's type always
    // wins over ENTRA_CREDENTIAL_TYPE from env/`.env`, same precedence as the
    // credentials themselves.
    const value = row.value as {
      clientId: string;
      tenantId: string;
      credentialType?: "secret" | "certificate" | "managed-identity";
      clientSecretEncrypted?: string;
      managedIdentityClientId?: string;
      privateKeyEncrypted?: string;
      thumbprintSha256?: string;
    };
    const tokenKey = process.env.TOKEN_ENCRYPTION_KEY ?? "demo-encryption-key-not-for-production-0";
    process.env.ENTRA_CLIENT_ID = value.clientId;
    process.env.ENTRA_TENANT_ID = value.tenantId;
    if (value.credentialType === "certificate") {
      process.env.ENTRA_CREDENTIAL_TYPE = "certificate";
      process.env.ENTRA_CERTIFICATE_PRIVATE_KEY = decryptPairedSecret(value.privateKeyEncrypted ?? "", tokenKey);
      process.env.ENTRA_CERTIFICATE_THUMBPRINT_SHA256 = value.thumbprintSha256 ?? "";
    } else if (value.credentialType === "managed-identity") {
      // Nothing secret to load: the VM's managed identity is the credential.
      process.env.ENTRA_CREDENTIAL_TYPE = "managed-identity";
      if (value.managedIdentityClientId) {
        process.env.ENTRA_MANAGED_IDENTITY_CLIENT_ID = value.managedIdentityClientId;
      }
    } else {
      process.env.ENTRA_CREDENTIAL_TYPE = "secret";
      process.env.ENTRA_CLIENT_SECRET = decryptPairedSecret(value.clientSecretEncrypted ?? "", tokenKey);
    }
  } catch (err) {
    // Boot must not hard-fail on a transient DB hiccup here — @patchpilot/graph's
    // own env validation below still runs, and will reject the boot if no
    // usable ENTRA_* credentials are available from any source.
    console.error("[load-env] failed to load paired Entra credentials:", err);
  }
}

/**
 * Fetches the client secret from Azure Key Vault, using this VM's managed
 * identity, when ENTRA_KEY_VAULT_SECRET_NAME is set (opt-in, Azure only — see
 * infra/azure/README.md). Runs after loadPairedEntraCredentials so the
 * paired row's credential type is already known, and wins over a paired or
 * `.env` secret: naming a vault secret is an explicit operator choice. A
 * failure is logged, not fatal — the instance then boots with
 * ENTRA_CONFIGURED false rather than silently using a stale local secret.
 * A rotated vault secret is picked up on the next restart.
 */
async function loadKeyVaultSecret(): Promise<void> {
  if ((process.env.DEMO_MODE ?? "true") !== "false") return;
  if ((process.env.ENTRA_CREDENTIAL_TYPE ?? "secret") !== "secret") return;
  const vaultUrl = process.env.ENTRA_KEY_VAULT_URL;
  const secretName = process.env.ENTRA_KEY_VAULT_SECRET_NAME;
  if (!secretName) return;
  delete process.env.ENTRA_CLIENT_SECRET;
  if (!vaultUrl) return;

  try {
    // The keyvault subpath, not the package root: the root pulls in env.ts,
    // which must not evaluate before this file has finished filling ENTRA_*.
    const { getKeyVaultSecret, managedIdentityTokenGetter } = await import("@patchpilot/graph/keyvault");
    process.env.ENTRA_CLIENT_SECRET = await getKeyVaultSecret(vaultUrl, secretName, {
      getToken: managedIdentityTokenGetter(process.env.ENTRA_MANAGED_IDENTITY_CLIENT_ID || undefined),
    });
  } catch (err) {
    console.error(
      "[load-env] failed to fetch the Entra client secret from Key Vault:",
      err instanceof Error ? err.message : err,
    );
  }
}

await loadPairedEntraCredentials();
await loadKeyVaultSecret();

// Belt-and-braces reconciliation, mirroring apps/api/src/load-env.ts's own
// (more heavily commented) fix for the same issue. @patchpilot/graph's env.js
// is a standalone eagerly-evaluated singleton (packages/graph/src/env.ts) —
// this worker process has no config module of its own to race against, but
// graph/env.js is subject to the identical tsx import-ordering hazard: it may
// already be evaluated, with pre-pairing blank ENTRA_* values baked in, by the
// time the async DB read above resolves. Patch it in place so every graph
// function that reads `env` live (see packages/graph/src/msal.ts) sees the
// corrected credentials regardless of which import won the race.
try {
  const graphEnvModule = await import("@patchpilot/graph");
  Object.assign(graphEnvModule.env, graphEnvModule.loadEnv());
  // Same scrub as apps/api/src/load-env.ts (see its comment): the graph env
  // singleton now holds these, and nothing reads them from process.env again.
  for (const name of ["ENTRA_CLIENT_SECRET", "ENTRA_CERTIFICATE_PRIVATE_KEY", "TOKEN_ENCRYPTION_KEY"]) {
    delete process.env[name];
  }
} catch (err) {
  console.error("[load-env] failed to reconcile @patchpilot/graph env with loaded env:", err);
}
