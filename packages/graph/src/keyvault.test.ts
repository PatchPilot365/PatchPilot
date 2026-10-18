import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearManagedIdentityDetectionCache,
  detectManagedIdentity,
  getKeyVaultSecret,
  normalizeVaultUrl,
  signDigestWithKeyVault,
} from "./keyvault.js";

const getToken = async () => "vault-token";

describe("normalizeVaultUrl", () => {
  it("reduces a vault URL to its origin", () => {
    expect(normalizeVaultUrl("https://pp.vault.azure.net/")).toBe("https://pp.vault.azure.net");
  });

  it("refuses a non-https vault URL, which would send the token in the clear", () => {
    expect(() => normalizeVaultUrl("http://pp.vault.azure.net")).toThrow("https://");
  });
});

describe("getKeyVaultSecret", () => {
  it("reads the current secret version with the vault token", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      Response.json({ value: "from-vault" }),
    );
    await expect(
      getKeyVaultSecret("https://pp.vault.azure.net", "entra secret", {
        getToken,
        fetch: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toBe("from-vault");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe("https://pp.vault.azure.net/secrets/entra%20secret?api-version=7.4");
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer vault-token");
  });

  it("surfaces Key Vault's error status and message", async () => {
    const fetchImpl = async () => new Response('{"error":{"code":"Forbidden"}}', { status: 403 });
    await expect(
      getKeyVaultSecret("https://pp.vault.azure.net", "s", { getToken, fetch: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow('Key Vault request failed: 403 {"error":{"code":"Forbidden"}}');
  });

  it("rejects a secret with no value", async () => {
    const fetchImpl = async () => Response.json({});
    await expect(
      getKeyVaultSecret("https://pp.vault.azure.net", "s", { getToken, fetch: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow("has no value");
  });
});

describe("signDigestWithKeyVault", () => {
  it("posts the base64url digest for RS256 and decodes the signature", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      Response.json({ value: Buffer.from("sig").toString("base64url") }),
    );
    const sig = await signDigestWithKeyVault("https://pp.vault.azure.net/keys/k/v1", Buffer.from([1, 2, 3]), {
      getToken,
      fetch: fetchImpl as unknown as typeof fetch,
    });
    expect(sig.toString()).toBe("sig");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe("https://pp.vault.azure.net/keys/k/v1/sign?api-version=7.4");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ alg: "RS256", value: "AQID" });
  });
});

describe("detectManagedIdentity", () => {
  const oid = "11111111-2222-3333-4444-555555555555";
  const tid = "66666666-7777-8888-9999-000000000000";
  const jwt = (claims: object) =>
    `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;

  beforeEach(() => clearManagedIdentityDetectionCache());

  it("reads the identity's object and tenant IDs from an IMDS token", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      Response.json({ access_token: jwt({ oid, tid }) }),
    );
    await expect(detectManagedIdentity({ fetch: fetchImpl as unknown as typeof fetch })).resolves.toEqual({
      objectId: oid,
      tenantId: tid,
    });
    const [url, init] = fetchImpl.mock.calls[0]!;
    const parsed = new URL(String(url));
    expect(parsed.origin).toBe("http://169.254.169.254");
    expect(parsed.searchParams.get("resource")).toBe("api://AzureADTokenExchange");
    expect(parsed.searchParams.has("client_id")).toBe(false);
    expect((init?.headers as Record<string, string>).Metadata).toBe("true");
  });

  it("asks for a user-assigned identity by client ID", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request) => Response.json({ access_token: jwt({ oid, tid }) }));
    await detectManagedIdentity({ clientId: "abc", fetch: fetchImpl as unknown as typeof fetch });
    expect(new URL(String(fetchImpl.mock.calls[0]![0])).searchParams.get("client_id")).toBe("abc");
  });

  it.each([
    ["a network error", async () => Promise.reject(new TypeError("fetch failed"))],
    ["a timeout", async () => Promise.reject(new DOMException("timed out", "TimeoutError"))],
    ["a non-200 response", async () => new Response("no identity", { status: 400 })],
    ["a non-JSON body", async () => new Response("<html>")],
    ["a token with no payload", async () => Response.json({ access_token: "nope" })],
    ["non-GUID claims", async () => Response.json({ access_token: jwt({ oid: "x", tid }) })],
  ])("returns null on %s", async (_name, impl) => {
    await expect(detectManagedIdentity({ fetch: impl as unknown as typeof fetch })).resolves.toBeNull();
  });

  it("caches the result, including a miss", async () => {
    const fetchImpl = vi.fn(async () => Promise.reject(new TypeError("fetch failed")));
    await detectManagedIdentity({ fetch: fetchImpl as unknown as typeof fetch });
    await detectManagedIdentity({ fetch: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
