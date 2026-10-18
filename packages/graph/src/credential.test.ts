import { constants, createPublicKey, generateKeyPairSync, privateEncrypt, verify } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  buildClientAssertion,
  describeEntraCredential,
  getMsalCredential,
  keyVaultCertificateAssertion,
} from "./credential.js";
import { generateSelfSignedCertificate } from "./x509.js";

const base = {
  ENTRA_CLIENT_SECRET: "s3cret",
  ENTRA_CERTIFICATE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
  ENTRA_CERTIFICATE_THUMBPRINT_SHA256: "AB".repeat(32),
  ENTRA_MANAGED_IDENTITY_CLIENT_ID: "",
  ENTRA_KEY_VAULT_URL: "",
  ENTRA_KEY_VAULT_SECRET_NAME: "",
  ENTRA_KEY_VAULT_CERTIFICATE_NAME: "",
};
const noToken = () => Promise.reject(new Error("no managed identity in tests"));
type AssertionCallback = (c: { clientId: string; tokenEndpoint?: string }) => Promise<string>;

describe("getMsalCredential", () => {
  it("returns only the client secret for the secret type", () => {
    expect(getMsalCredential({ ...base, ENTRA_CREDENTIAL_TYPE: "secret" }, noToken)).toEqual({
      clientSecret: "s3cret",
    });
  });

  it("returns only the certificate for the certificate type, never the secret", () => {
    const cred = getMsalCredential({ ...base, ENTRA_CREDENTIAL_TYPE: "certificate" }, noToken);
    expect(cred).toEqual({
      clientCertificate: {
        thumbprintSha256: base.ENTRA_CERTIFICATE_THUMBPRINT_SHA256,
        privateKey: base.ENTRA_CERTIFICATE_PRIVATE_KEY,
      },
    });
    expect(cred).not.toHaveProperty("clientSecret");
  });

  it("uses a managed identity token for the federated credential audience as the assertion", async () => {
    const getToken = vi.fn(async (resource: string) => `mi-token-for:${resource}`);
    const cred = getMsalCredential({ ...base, ENTRA_CREDENTIAL_TYPE: "managed-identity" }, getToken);
    expect(Object.keys(cred)).toEqual(["clientAssertion"]);
    const assertion = cred.clientAssertion as AssertionCallback;
    await expect(assertion({ clientId: "app" })).resolves.toBe("mi-token-for:api://AzureADTokenExchange");
  });

  it("signs with Key Vault instead of the local key when a vault certificate is named", () => {
    const cred = getMsalCredential(
      {
        ...base,
        ENTRA_CREDENTIAL_TYPE: "certificate",
        ENTRA_KEY_VAULT_URL: "https://pp.vault.azure.net",
        ENTRA_KEY_VAULT_CERTIFICATE_NAME: "patchpilot",
      },
      noToken,
    );
    expect(Object.keys(cred)).toEqual(["clientAssertion"]);
  });

  it("ignores a vault certificate name for the secret type", () => {
    const cred = getMsalCredential(
      { ...base, ENTRA_CREDENTIAL_TYPE: "secret", ENTRA_KEY_VAULT_CERTIFICATE_NAME: "patchpilot" },
      noToken,
    );
    expect(cred).toEqual({ clientSecret: "s3cret" });
  });
});

// PKCS#1 v1.5 signature over an already-computed SHA-256 digest, which is
// what Key Vault's RS256 sign operation produces.
const SHA256_DIGEST_INFO = Buffer.from("3031300d060960864801650304020105000420", "hex");
function rsaSignDigest(privateKey: string, digest: Buffer): Buffer {
  return privateEncrypt(
    { key: privateKey, padding: constants.RSA_PKCS1_PADDING },
    Buffer.concat([SHA256_DIGEST_INFO, digest]),
  );
}

function decodeJwt(jwt: string) {
  const [h, p, sig] = jwt.split(".");
  return {
    header: JSON.parse(Buffer.from(h!, "base64url").toString()),
    payload: JSON.parse(Buffer.from(p!, "base64url").toString()),
    signingInput: `${h}.${p}`,
    signature: Buffer.from(sig!, "base64url"),
  };
}

describe("buildClientAssertion", () => {
  it("produces an RS256 JWT that verifies with the certificate's public key", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const now = new Date("2026-10-18T00:00:00Z");
    const jwt = await buildClientAssertion({
      clientId: "app-id",
      audience: "https://login.microsoftonline.com/customer/oauth2/v2.0/token",
      x5tS256: "thumb",
      signDigest: async (digest) => rsaSignDigest(pem, digest),
      now,
    });
    const { header, payload, signingInput, signature } = decodeJwt(jwt);
    const iat = now.getTime() / 1000;
    expect(header).toEqual({ alg: "RS256", typ: "JWT", "x5t#S256": "thumb" });
    expect(payload).toMatchObject({
      aud: "https://login.microsoftonline.com/customer/oauth2/v2.0/token",
      iss: "app-id",
      sub: "app-id",
      nbf: iat,
      exp: iat + 600,
    });
    expect(verify("sha256", Buffer.from(signingInput), publicKey, signature)).toBe(true);
  });
});

describe("keyVaultCertificateAssertion", () => {
  function fakeVault(opts: { kid?: string } = {}) {
    const cert = generateSelfSignedCertificate("PatchPilot-kv-test", 365);
    const der = Buffer.from(cert.certificatePem.replace(/-----[A-Z ]+-----|\s/g, ""), "base64");
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      calls.push(`${init?.method ?? "GET"} ${u.split("?")[0]}`);
      expect((init?.headers as Record<string, string>).authorization).toBe("Bearer vault-token");
      if (u.includes("/certificates/")) {
        return Response.json({
          kid: opts.kid ?? "https://pp.vault.azure.net/keys/patchpilot/v1",
          cer: der.toString("base64"),
        });
      }
      const { alg, value } = JSON.parse(String(init?.body));
      expect(alg).toBe("RS256");
      const sig = rsaSignDigest(cert.privateKeyPem, Buffer.from(value, "base64url"));
      return Response.json({ kid: "https://pp.vault.azure.net/keys/patchpilot/v1", value: sig.toString("base64url") });
    });
    const getToken = vi.fn(async (resource: string) => {
      expect(resource).toBe("https://vault.azure.net");
      return "vault-token";
    });
    return { cert, calls, fetchImpl: fetchImpl as unknown as typeof fetch, getToken };
  }

  it("signs with the vault key and reuses the assertion per token endpoint", async () => {
    const vault = fakeVault();
    const assertion = keyVaultCertificateAssertion(
      "https://pp.vault.azure.net/",
      `reuse-${Math.random()}`,
      vault.getToken,
      vault.fetchImpl,
    );
    const endpoint = "https://login.microsoftonline.com/msp/oauth2/v2.0/token";

    const jwt = await assertion({ clientId: "app-id", tokenEndpoint: endpoint });
    const { header, payload, signingInput, signature } = decodeJwt(jwt);
    expect(header["x5t#S256"]).toBe(Buffer.from(vault.cert.thumbprintSha256, "hex").toString("base64url"));
    expect(payload.aud).toBe(endpoint);
    const publicKey = createPublicKey(vault.cert.certificatePem);
    expect(verify("sha256", Buffer.from(signingInput), publicKey, signature)).toBe(true);

    expect(await assertion({ clientId: "app-id", tokenEndpoint: endpoint })).toBe(jwt);
    await assertion({
      clientId: "app-id",
      tokenEndpoint: "https://login.microsoftonline.com/customer/oauth2/v2.0/token",
    });
    expect(vault.calls.filter((c) => c.startsWith("GET"))).toHaveLength(1);
    expect(vault.calls.filter((c) => c.startsWith("POST"))).toHaveLength(2);
  });

  it("refuses to send the vault token to a key outside the configured vault", async () => {
    const vault = fakeVault({ kid: "https://evil.example/keys/patchpilot/v1" });
    const assertion = keyVaultCertificateAssertion(
      "https://pp.vault.azure.net",
      `evil-${Math.random()}`,
      vault.getToken,
      vault.fetchImpl,
    );
    await expect(
      assertion({ clientId: "app-id", tokenEndpoint: "https://login.microsoftonline.com/msp/oauth2/v2.0/token" }),
    ).rejects.toThrow("points outside https://pp.vault.azure.net");
    expect(vault.calls.filter((c) => c.startsWith("POST"))).toHaveLength(0);
  });
});

describe("describeEntraCredential", () => {
  it("describes a managed identity row", () => {
    expect(describeEntraCredential({ credentialType: "managed-identity" })).toEqual({ type: "managed-identity" });
  });

  it("treats a legacy row with no credentialType as a secret", () => {
    expect(describeEntraCredential({})).toEqual({ type: "secret" });
  });

  it("reads expiry and thumbprint from the stored certificate itself", () => {
    const cert = generateSelfSignedCertificate("PatchPilot-test", 365, new Date("2026-10-18T00:00:00Z"));
    expect(describeEntraCredential({ credentialType: "certificate", certificatePem: cert.certificatePem })).toEqual({
      type: "certificate",
      expiresAt: cert.notAfter.toISOString(),
      thumbprintSha256: cert.thumbprintSha256,
    });
  });

  it("still reports the type when the stored PEM is unreadable", () => {
    expect(describeEntraCredential({ credentialType: "certificate", certificatePem: "garbage" })).toEqual({
      type: "certificate",
    });
  });
});
