import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, tables } from "@patchpilot/db";
import { encrypt, sha256Hex, auditSafe, generateSelfSignedCertificate } from "@patchpilot/graph";
import { detectManagedIdentity } from "@patchpilot/graph/keyvault";
import { SYSTEM_ACTORS, can, CREDENTIALS_ROTATED_CHANNEL, currentScopeBaseline } from "@patchpilot/shared";
import { config } from "../config.js";
import { connection } from "../queue.js";
import { exitAfterReply } from "../restart-after-reply.js";

/**
 * The pairing flow's two routes, deliberately isolated in their own hook-free
 * plugin rather than folded into routes/onboarding.ts. That file's
 * `onboardingRoutes` installs a blanket `session.engineer` + `settings:read`
 * preHandler hook; Fastify applies a plugin's hooks to every route in its
 * encapsulation context regardless of declaration order, so a route that
 * sometimes (or always) needs to be public cannot share a plugin with those
 * hooks. Both routes here do their own auth check inline instead.
 *
 * POST /api/onboarding/pair is ALWAYS public — a single-use, short-TTL,
 * cryptographically random token is its entire authentication, by design (see
 * the CSRF exemption comment in server.ts). GET /api/onboarding/pairing-script
 * is public only while this instance has never been paired (config.ENTRA_CONFIGURED
 * === false); once paired, issuing a fresh pairing script means re-registering
 * against Entra, which is a deliberate admin action gated on settings:write.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
// Same relative depth from apps/api/src/routes and apps/api/dist/routes to the
// repo root, so this path is correct for both `tsx watch src/index.ts` (dev)
// and `node dist/index.js` (prod) without an env var or build-time copy step.
const DEPLOY_SCRIPT_PATH = join(__dirname, "../../../../scripts/Deploy-PatchPilot.ps1");

// Guards what gets spliced into the script as a PowerShell string literal.
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A first-ever run installs the Microsoft.Graph PowerShell module (which can
// take 5-15+ minutes on a machine with nothing cached), then does interactive
// sign-in, GDAP enumeration, and role-assignment loops with backoff before
// ever reaching the pairing POST at the very end - comfortably over 30
// minutes on a slow first run.
const PAIRING_TOKEN_TTL_MS = 60 * 60 * 1000;

// Validity of the instance-generated certificate credential. Setup -> App
// Registration warns from 30 days out; rotating is just downloading and
// running a fresh pairing script.
const CERTIFICATE_VALIDITY_DAYS = 365;

const pairBodySchema = z.object({
  token: z.string().min(1),
  clientId: z.string().min(1),
  tenantId: z.string().min(1),
  // "secret" by default so a script downloaded before certificate pairing
  // existed (or a manual caller) still pairs exactly as before. "certificate"
  // means the script registered the public certificate this token was issued
  // with; the private key is already here, on the token row, and is never
  // accepted from the request body. "managed-identity" means the script added
  // a federated identity credential for this Azure VM's managed identity, so
  // there is no credential to send at all.
  credentialType: z.enum(["secret", "certificate", "managed-identity"]).default("secret"),
  clientSecret: z.string().min(1).optional(),
  // Managed identity only: a user-assigned identity's client ID. Omitted for
  // the VM's system-assigned identity, which needs no ID.
  managedIdentityClientId: z.string().regex(GUID_RE, "managedIdentityClientId must be a GUID").nullish(),
  // Optional: the UPN Deploy-PatchPilot.ps1 was signed in to Microsoft Graph
  // as when it created the app registration ($context.Account — see the
  // script's Connect-MgGraph section). Lets a fresh pairing self-provision
  // its first admin with no separate manual .env edit + restart, the same
  // "zero manual typing" goal the rest of this flow already has. Optional
  // because older scripts and any non-script pairing caller won't send it.
  // .nullish() (not just .optional()): the script omits this key entirely
  // when it can't determine the UPN (see its own comment on $adminUpn), but
  // this field must never be the reason the WHOLE pairing request 400s —
  // an older/different caller sending an explicit `"adminUpn": null` should
  // degrade to "not provided", not fail credentials that are otherwise
  // valid. Live-observed regression: a device-code Graph sign-in leaves
  // $context.Account empty, which an earlier version of the script sent
  // through verbatim as JSON null, and z.string().min(1).optional() rejects
  // null (it only accepts undefined) — 400ing pairing entirely.
  adminUpn: z.string().min(1).nullish(),
  // Object IDs of the two home-tenant role-assignable security groups
  // Deploy-PatchPilot.ps1 provisions (see packages/graph/src/access-groups.ts).
  // .nullish() for the same reason as adminUpn above: the script sends these
  // as best-effort (it degrades gracefully — prints the required groups/roles
  // and continues — when the signed-in admin lacked Global Administrator/
  // Privileged Role Administrator), and a caller that can't determine them
  // must never be the reason the whole pairing request 400s.
  readOnlyGroupId: z.string().min(1).nullish(),
  writeGroupId: z.string().min(1).nullish(),
})
  .refine((b) => b.credentialType !== "secret" || b.clientSecret, {
    message: "clientSecret is required when credentialType is secret",
  })
  .refine((b) => b.credentialType === "managed-identity" || !b.managedIdentityClientId, {
    message: "managedIdentityClientId is only valid when credentialType is managed-identity",
  });

export async function onboardingPairingRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/onboarding/pair",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (req, reply) => {
      if (config.DEMO_MODE) {
        return reply.code(400).send({ error: "not_available_in_demo_mode" });
      }

      const parsed = pairBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "invalid body" });
      }
      const body = parsed.data;

      // Single atomic conditional UPDATE: the WHERE clause IS the single-use
      // gate (consumed_at is null, not expired). No separate read-then-write —
      // that would race two concurrent POSTs for the same token.
      const [tokenRow] = await db
        .update(tables.onboardingPairingTokens)
        .set({ consumedAt: new Date() })
        .where(
          and(
            eq(tables.onboardingPairingTokens.tokenHash, sha256Hex(body.token)),
            isNull(tables.onboardingPairingTokens.consumedAt),
            gt(tables.onboardingPairingTokens.expiresAt, new Date()),
          ),
        )
        .returning();

      if (!tokenRow) {
        // Deliberately generic — expired, already used, and never-existed all
        // look identical from the outside. No oracle for probing.
        return reply.code(400).send({ error: "invalid_or_expired_token" });
      }

      let credential:
        | { credentialType: "secret"; clientSecretEncrypted: string }
        | {
            credentialType: "certificate";
            certificatePem: string;
            privateKeyEncrypted: string;
            thumbprintSha256: string;
          }
        | { credentialType: "managed-identity"; managedIdentityClientId?: string };
      if (body.credentialType === "certificate") {
        if (!tokenRow.certificatePem || !tokenRow.privateKeyEncrypted || !tokenRow.thumbprintSha256) {
          // Only reachable with a token issued before certificate pairing
          // existed, or a hand-built request. The token is spent either way.
          return reply.code(400).send({ error: "token_has_no_certificate" });
        }
        credential = {
          credentialType: "certificate",
          certificatePem: tokenRow.certificatePem,
          privateKeyEncrypted: tokenRow.privateKeyEncrypted,
          thumbprintSha256: tokenRow.thumbprintSha256,
        };
      } else if (body.credentialType === "managed-identity") {
        credential = {
          credentialType: "managed-identity",
          ...(body.managedIdentityClientId ? { managedIdentityClientId: body.managedIdentityClientId } : {}),
        };
      } else {
        credential = { credentialType: "secret", clientSecretEncrypted: encrypt(body.clientSecret!) };
      }

      const value = {
        clientId: body.clientId,
        tenantId: body.tenantId,
        ...credential,
        pairedAt: new Date().toISOString(),
        pairedBy: SYSTEM_ACTORS.onboardingPairing,
      };
      await db
        .insert(tables.settings)
        .values({ key: "entra-app-registration", value })
        .onConflictDoUpdate({
          target: tables.settings.key,
          set: { value, updatedAt: new Date() },
        });

      // The key now lives in the settings row (certificate) or was never used
      // (secret, managed identity); either way, don't leave it on a spent token.
      if (tokenRow.privateKeyEncrypted) {
        await db
          .update(tables.onboardingPairingTokens)
          .set({ privateKeyEncrypted: null })
          .where(eq(tables.onboardingPairingTokens.id, tokenRow.id));
      }

      // Best-effort, additive only: never overwrite an admin UPN a previous
      // pairing (or a manual BOOTSTRAP_ADMIN_UPN in .env) already established.
      // load-env.ts's loadBootstrapAdminUpn() treats an explicit local
      // env/.env value as the operator's own override and leaves it alone —
      // this row is only ever a *fallback* default, so re-pairing (e.g. a
      // client secret rotation) can't silently reassign who bootstraps as
      // admin just because a different person happened to run the script.
      //
      // Shape-checked, not just non-empty: Deploy-PatchPilot.ps1 now filters
      // this itself (see its own comment on $adminUpn), but a live-observed
      // failure mode is worth guarding here too — Get-AzContext's Account.Id
      // came back as the literal string "MSI@50342" (Az PowerShell's
      // placeholder for a Managed Identity login) on at least one Cloud
      // Shell session. Writing that as the sole bootstrap admin
      // (auth/bootstrap.ts) locks the real signed-in admin out entirely,
      // which is worse than leaving this row unwritten.
      if (body.adminUpn && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.adminUpn)) {
        await db
          .insert(tables.settings)
          .values({
            key: "bootstrap-admin",
            value: { upn: body.adminUpn, source: "onboarding-pairing", pairedAt: new Date().toISOString() },
          })
          .onConflictDoNothing({ target: tables.settings.key });
      }

      // Best-effort, additive only (same reasoning as the bootstrap-admin
      // block above): only ever write a group ID the script actually
      // determined, and only when at least one is present. Merged onto
      // whatever this row already holds (rather than overwritten wholesale)
      // so a re-pairing (e.g. a client secret rotation) run without group
      // provisioning — the script failed that step gracefully and sent only
      // one ID, or neither — never clobbers a group ID a previous pairing
      // already established.
      if (body.readOnlyGroupId || body.writeGroupId) {
        const [existingGroupsRow] = await db
          .select()
          .from(tables.settings)
          .where(eq(tables.settings.key, "patchpilot-access-groups"));
        const groupIds = {
          ...(existingGroupsRow?.value as Record<string, string> | undefined),
          ...(body.readOnlyGroupId ? { readOnlyGroupId: body.readOnlyGroupId } : {}),
          ...(body.writeGroupId ? { writeGroupId: body.writeGroupId } : {}),
        };
        await db
          .insert(tables.settings)
          .values({ key: "patchpilot-access-groups", value: groupIds })
          .onConflictDoUpdate({
            target: tables.settings.key,
            set: { value: groupIds, updatedAt: new Date() },
          });
      }

      // Stamps the drift baseline routes/onboarding.ts compares against for
      // "Sync permissions" needed hint. Deploy-PatchPilot.ps1 is only ever
      // reached here after being downloaded live from THIS instance's own
      // /api/onboarding/pairing-script (see that route below), byte-identical
      // to the currently-deployed script — so whatever scopes.ts requests
      // right now is exactly what the script that produced this pairing just
      // requested. Always read-only (false): a fresh/rotated pairing never
      // carries the write-scopes opt-in, which is a "Sync permissions"-only
      // checkbox — see EnableRemediationWriteScopes in the script itself for
      // the equivalent switch on a manual run.
      await db
        .insert(tables.settings)
        .values({ key: "entra-scopes-baseline", value: { includeWriteScopes: false, ...currentScopeBaseline(false) } })
        .onConflictDoUpdate({
          target: tables.settings.key,
          set: { value: { includeWriteScopes: false, ...currentScopeBaseline(false) }, updatedAt: new Date() },
        });

      await auditSafe({
        engineer: SYSTEM_ACTORS.onboardingPairing,
        actorType: "system",
        tenantId: body.tenantId,
        endpoint: "/api/onboarding/pair",
        method: "POST",
        action: "onboarding:paired",
        resourceType: "application",
        resourceId: body.clientId,
        summary:
          credential.credentialType === "certificate"
            ? `Instance paired with a customer-supplied Entra app registration (certificate ${credential.thumbprintSha256})`
            : credential.credentialType === "managed-identity"
              ? `Instance paired with a customer-supplied Entra app registration (managed identity${
                  credential.managedIdentityClientId ? ` ${credential.managedIdentityClientId}` : ", system-assigned"
                })`
              : "Instance paired with a customer-supplied Entra app registration (client secret)",
        outcome: "success",
        responseStatus: 200,
      });

      // Tell every other process (and this one, on its next boot) to pick up
      // the freshly paired credentials. Compose's restart policy brings the
      // process back; load-env.ts reads the settings row we just wrote on the
      // way in. The exit is scheduled before publishing so this process's own
      // copy of the message doesn't kill it mid-reply (isExitAfterReplyPending).
      exitAfterReply(reply);
      await connection.publish(CREDENTIALS_ROTATED_CHANNEL, "paired").catch(() => undefined);

      reply.send({ paired: true });
    },
  );

  app.get("/api/onboarding/pairing-script", async (req, reply) => {
    if (config.DEMO_MODE) {
      return reply.code(400).send({ error: "not_available_in_demo_mode" });
    }

    // Once paired, re-issuing a personalized installer is an authenticated
    // admin action (rotating/re-registering an existing app registration) —
    // mirrors requirePermission("settings:write") inline, since this plugin
    // has no hooks to hang that on for the still-unpaired (public) case below.
    let issuedBy: string = SYSTEM_ACTORS.onboardingPairing;
    if (config.ENTRA_CONFIGURED) {
      if (!req.currentUser) {
        return reply.code(401).send({ error: "unauthenticated" });
      }
      if (!can(req.currentUser.role, "settings:write")) {
        return reply.code(403).send({ error: "forbidden", required: "settings:write" });
      }
      issuedBy = req.currentUser.upn;
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + PAIRING_TOKEN_TTL_MS);
    // A fresh key pair per script: the script registers only the public
    // certificate on the app; the private key never leaves this instance.
    const certificate = generateSelfSignedCertificate(
      `PatchPilot (${new URL(config.PUBLIC_URL).host})`,
      CERTIFICATE_VALIDITY_DAYS,
    );
    await db.insert(tables.onboardingPairingTokens).values({
      tokenHash: sha256Hex(token),
      redirectUri: config.AUTH_REDIRECT_URI,
      createdBy: issuedBy,
      expiresAt,
      certificatePem: certificate.certificatePem,
      privateKeyEncrypted: encrypt(certificate.privateKeyPem),
      thumbprintSha256: certificate.thumbprintSha256,
    });

    // On an Azure VM, pre-fill the script with this VM's managed identity so
    // it pairs with that (nothing stored anywhere) instead of the
    // certificate above, which stays in the script as the fallback. The
    // script only uses it when the identity's tenant is the one it pairs
    // in. Off Azure this is a fast, cached miss and the script is unchanged.
    const managedIdentityClientId = config.ENTRA_MANAGED_IDENTITY_CLIENT_ID || undefined;
    const managedIdentity = await detectManagedIdentity({ clientId: managedIdentityClientId });

    // Strip a leading UTF-8 BOM defensively (node's readFileSync("utf8") does
    // not do this itself, unlike PowerShell's own .ps1 file loader). A BOM
    // survives harmlessly when this script is downloaded and run as a file,
    // but the Cloud Shell one-liner (irm ... | [scriptblock]::Create(...))
    // feeds the fetched text straight into the parser as a raw string, where
    // the BOM becomes a literal leading character. PowerShell then no longer
    // sees [CmdletBinding()]/param() as the block's first statement — which
    // both attributes require — and fails with a "position sensitive" parse
    // error. Source-of-truth fix is keeping scripts/Deploy-PatchPilot.ps1
    // itself saved without a BOM; this is a defensive backstop in case some
    // future editor resaves it with one.
    const template = readFileSync(DEPLOY_SCRIPT_PATH, "utf8").replace(/^\uFEFF/, "");
    const script = template
      .replace(/\{\{INSTANCE_URL\}\}/g, config.PUBLIC_URL)
      .replace(/\{\{PAIRING_TOKEN\}\}/g, token)
      .replace(/\{\{REDIRECT_URI\}\}/g, config.AUTH_REDIRECT_URI)
      // Once paired, default the script to this instance's own tenant so a
      // re-pair doesn't fall back to auto-detecting whatever Azure session
      // the admin's machine happens to hold. Unpaired: left as a placeholder
      // (the script treats that as "not supplied").
      .replace(
        /\{\{MSP_TENANT_ID\}\}/g,
        config.ENTRA_CONFIGURED && GUID_RE.test(config.ENTRA_TENANT_ID) ? config.ENTRA_TENANT_ID : "{{MSP_TENANT_ID}}",
      )
      // Base64 body only (no PEM armour or newlines), so it drops into a
      // single-quoted PowerShell string.
      .replace(
        /\{\{CERTIFICATE_BASE64\}\}/g,
        certificate.certificatePem.replace(/-----[A-Z ]+-----|\s/g, ""),
      )
      // Left as placeholders when no managed identity was detected; the
      // script treats those as "not supplied".
      .replace(/\{\{MANAGED_IDENTITY_OBJECT_ID\}\}/g, managedIdentity?.objectId ?? "{{MANAGED_IDENTITY_OBJECT_ID}}")
      .replace(/\{\{MANAGED_IDENTITY_TENANT_ID\}\}/g, managedIdentity?.tenantId ?? "{{MANAGED_IDENTITY_TENANT_ID}}")
      .replace(
        /\{\{MANAGED_IDENTITY_CLIENT_ID\}\}/g,
        managedIdentity && managedIdentityClientId ? managedIdentityClientId : "{{MANAGED_IDENTITY_CLIENT_ID}}",
      );

    await auditSafe({
      engineer: issuedBy,
      endpoint: "/api/onboarding/pairing-script",
      method: "GET",
      action: "onboarding:pairing-token-issued",
      resourceType: "application",
      summary: `Pairing script downloaded (expires ${expiresAt.toISOString()})${managedIdentity ? ", Azure managed identity detected" : ""}`,
      outcome: "success",
      responseStatus: 200,
    });

    return reply
      .header("content-type", "text/plain; charset=utf-8")
      .header("content-disposition", 'attachment; filename="Deploy-PatchPilot.ps1"')
      .header("cache-control", "no-store, private")
      .send(script);
  });
}
