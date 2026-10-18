import Fastify from "fastify";
import { X509Certificate, createPrivateKey, createPublicKey } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Fastify `.inject()` coverage for the pairing flow's credential handling,
 * following domains.test.ts's harness: `@patchpilot/db` mocked with an
 * in-memory, table-keyed store, drizzle's predicate builders swapped for
 * plain-object ones so the single-use token UPDATE really narrows to one
 * row, and every outward boundary (audit, Redis publish, process exit) mocked.
 */

const { tableRows, auditSafeMock, publishMock, exitAfterReplyMock } = vi.hoisted(() => ({
  tableRows: new Map<unknown, Record<string, unknown>[]>(),
  auditSafeMock: vi.fn(),
  publishMock: vi.fn(),
  exitAfterReplyMock: vi.fn(),
}));

type Row = Record<string, unknown>;
type Predicate = (row: Row) => boolean;

interface Chain extends PromiseLike<Row[]> {
  where: (pred?: Predicate) => Chain;
}

function chain(rows: Row[]): Chain {
  return {
    where: (pred) => chain(typeof pred === "function" ? rows.filter(pred) : rows),
    then: (onFulfilled, onRejected) => Promise.resolve(rows).then(onFulfilled, onRejected),
  };
}

vi.mock("@patchpilot/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@patchpilot/db")>();
  const rowsOf = (table: unknown) => {
    const list = tableRows.get(table) ?? [];
    tableRows.set(table, list);
    return list;
  };
  const db = {
    select: () => ({ from: (table: unknown) => chain(tableRows.get(table) ?? []) }),
    insert: (table: unknown) => ({
      values: (vals: Row) => {
        const plainInsert = () => {
          const row: Row = { id: `row-${rowsOf(table).length + 1}`, consumedAt: null, ...vals };
          rowsOf(table).push(row);
          return row;
        };
        // Every upsert in onboarding-pairing.ts targets settings.key.
        const existing = () => rowsOf(table).find((r) => r.key === vals.key);
        return {
          returning: async () => [plainInsert()],
          onConflictDoUpdate: async ({ set }: { set: Row }) => {
            const row = existing();
            if (row) Object.assign(row, set);
            else plainInsert();
          },
          onConflictDoNothing: async () => {
            if (!existing()) plainInsert();
          },
          then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
            Promise.resolve(plainInsert()).then(onFulfilled, onRejected),
        };
      },
    }),
    update: (table: unknown) => ({
      set: (vals: Row) => ({
        where: (pred?: Predicate) => {
          const apply = () => {
            const matched = rowsOf(table).filter((r) => (typeof pred === "function" ? pred(r) : true));
            matched.forEach((row) => Object.assign(row, vals));
            return matched.map((r) => ({ ...r }));
          };
          return {
            returning: async () => apply(),
            then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
              Promise.resolve(apply()).then(onFulfilled, onRejected),
          };
        },
      }),
    }),
  };
  return { ...actual, db };
});

// Drizzle columns carry the snake_case DB name; the in-memory rows are keyed
// by the camelCase JS property, as drizzle's own result objects are.
const prop = (column: { name: string }) => column.name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq:
      (column: { name: string }, value: unknown): Predicate =>
      (row) =>
        row[prop(column)] === value,
    gt:
      (column: { name: string }, value: Date): Predicate =>
      (row) =>
        (row[prop(column)] as Date) > value,
    isNull:
      (column: { name: string }): Predicate =>
      (row) =>
        row[prop(column)] == null,
    and:
      (...preds: Predicate[]): Predicate =>
      (row) =>
        preds.every((p) => p(row)),
  };
});

vi.mock("@patchpilot/graph", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@patchpilot/graph")>();
  return { ...actual, auditSafe: auditSafeMock };
});

vi.mock("../queue.js", () => ({ connection: { publish: publishMock } }));
vi.mock("../restart-after-reply.js", () => ({ exitAfterReply: exitAfterReplyMock }));

vi.mock("../config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config.js")>();
  return {
    ...actual,
    config: {
      ...actual.config,
      DEMO_MODE: false,
      // Never paired, so the pairing-script download is public.
      ENTRA_CONFIGURED: false,
      PUBLIC_URL: "https://patchpilot.example.com",
      AUTH_REDIRECT_URI: "https://patchpilot.example.com/auth/callback",
    },
  };
});

const { onboardingPairingRoutes } = await import("./onboarding-pairing.js");
const { tables } = await import("@patchpilot/db");
const { decrypt, sha256Hex } = await import("@patchpilot/graph");

async function buildApp() {
  const app = Fastify();
  app.decorateRequest("currentUser", null as unknown as never);
  await app.register(onboardingPairingRoutes);
  await app.ready();
  return app;
}

async function downloadScript(app: Awaited<ReturnType<typeof buildApp>>) {
  const res = await app.inject({ method: "GET", url: "/api/onboarding/pairing-script" });
  expect(res.statusCode).toBe(200);
  const token = /\$PairingToken = "([^"]+)"/.exec(res.body)?.[1];
  const certificateBase64 = /\$CertificateBase64 = "([^"]+)"/.exec(res.body)?.[1];
  return { script: res.body, token: token!, certificateBase64: certificateBase64! };
}

const settingsRow = (key: string) => (tableRows.get(tables.settings) ?? []).find((r) => r.key === key);
const tokenRows = () => tableRows.get(tables.onboardingPairingTokens) ?? [];

beforeEach(() => {
  tableRows.clear();
  auditSafeMock.mockReset();
  publishMock.mockReset().mockResolvedValue(1);
  exitAfterReplyMock.mockReset();
});

describe("GET /api/onboarding/pairing-script", () => {
  it("embeds only the public certificate and keeps the encrypted key on the token row", async () => {
    const app = await buildApp();
    const { script, token, certificateBase64 } = await downloadScript(app);

    expect(token).not.toMatch(/^\{\{/);
    expect(certificateBase64).not.toMatch(/^\{\{/);
    expect(script).not.toContain("PRIVATE KEY");

    const cert = new X509Certificate(Buffer.from(certificateBase64, "base64"));
    expect(cert.subject).toBe("CN=PatchPilot (patchpilot.example.com)");

    const [row] = tokenRows();
    expect(row!.tokenHash).toBe(sha256Hex(token));
    expect(row!.thumbprintSha256).toBe(cert.fingerprint256.replace(/:/g, ""));
    const privateKeyPem = decrypt(row!.privateKeyEncrypted as string);
    expect(
      createPublicKey(createPrivateKey(privateKeyPem))
        .export({ type: "spki", format: "der" })
        .equals(cert.publicKey.export({ type: "spki", format: "der" })),
    ).toBe(true);
  });
});

describe("POST /api/onboarding/pair", () => {
  it("pairs with the token's certificate, ignoring any key material in the body, and clears the token's copy", async () => {
    const app = await buildApp();
    const { token } = await downloadScript(app);
    const issued = { ...tokenRows()[0]! };

    const res = await app.inject({
      method: "POST",
      url: "/api/onboarding/pair",
      payload: {
        token,
        clientId: "client-1",
        tenantId: "tenant-1",
        credentialType: "certificate",
        privateKeyEncrypted: "attacker-supplied",
      },
    });
    expect(res.statusCode).toBe(200);

    const value = settingsRow("entra-app-registration")!.value as Row;
    expect(value).toMatchObject({
      clientId: "client-1",
      tenantId: "tenant-1",
      credentialType: "certificate",
      certificatePem: issued.certificatePem,
      privateKeyEncrypted: issued.privateKeyEncrypted,
      thumbprintSha256: issued.thumbprintSha256,
    });
    expect(value).not.toHaveProperty("clientSecretEncrypted");
    expect(tokenRows()[0]!.privateKeyEncrypted).toBeNull();
    expect(tokenRows()[0]!.consumedAt).toBeInstanceOf(Date);
  });

  it("refuses to reuse a spent token", async () => {
    const app = await buildApp();
    const { token } = await downloadScript(app);
    const body = { token, clientId: "client-1", tenantId: "tenant-1", credentialType: "certificate" };
    expect((await app.inject({ method: "POST", url: "/api/onboarding/pair", payload: body })).statusCode).toBe(200);
    const replay = await app.inject({ method: "POST", url: "/api/onboarding/pair", payload: body });
    expect(replay.statusCode).toBe(400);
    expect(replay.json()).toEqual({ error: "invalid_or_expired_token" });
  });

  it("still pairs an older script's body (no credentialType) as a client secret", async () => {
    const app = await buildApp();
    const { token } = await downloadScript(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/onboarding/pair",
      payload: { token, clientId: "client-1", tenantId: "tenant-1", clientSecret: "s3cret" },
    });
    expect(res.statusCode).toBe(200);
    const value = settingsRow("entra-app-registration")!.value as Row;
    expect(value.credentialType).toBe("secret");
    expect(decrypt(value.clientSecretEncrypted as string)).toBe("s3cret");
    expect(value).not.toHaveProperty("privateKeyEncrypted");
  });

  it("rejects a secret pairing with no secret before spending the token", async () => {
    const app = await buildApp();
    const { token } = await downloadScript(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/onboarding/pair",
      payload: { token, clientId: "client-1", tenantId: "tenant-1" },
    });
    expect(res.statusCode).toBe(400);
    expect(tokenRows()[0]!.consumedAt).toBeNull();
  });

  it("rejects a certificate pairing against a token issued without a certificate", async () => {
    const app = await buildApp();
    tableRows.set(tables.onboardingPairingTokens, [
      {
        id: "legacy-token",
        tokenHash: sha256Hex("legacy"),
        redirectUri: "https://patchpilot.example.com/auth/callback",
        createdBy: "system",
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
        certificatePem: null,
        privateKeyEncrypted: null,
        thumbprintSha256: null,
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/onboarding/pair",
      payload: { token: "legacy", clientId: "client-1", tenantId: "tenant-1", credentialType: "certificate" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "token_has_no_certificate" });
    expect(settingsRow("entra-app-registration")).toBeUndefined();
  });
});
