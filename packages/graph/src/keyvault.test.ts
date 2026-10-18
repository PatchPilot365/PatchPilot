import { describe, expect, it, vi } from "vitest";
import { getKeyVaultSecret, normalizeVaultUrl, signDigestWithKeyVault } from "./keyvault.js";

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
