import { X509Certificate, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateSelfSignedCertificate } from "./x509.js";

describe("generateSelfSignedCertificate", () => {
  const now = new Date("2026-10-18T00:00:00Z");
  const cert = generateSelfSignedCertificate("PatchPilot-test", 365, now);
  const x509 = new X509Certificate(cert.certificatePem);

  it("produces a certificate Node's own parser accepts, with a valid self-signature", () => {
    expect(x509.subject).toBe("CN=PatchPilot-test");
    expect(x509.issuer).toBe("CN=PatchPilot-test");
    expect(x509.verify(x509.publicKey)).toBe(true);
    expect(x509.ca).toBe(false);
  });

  it("reports the same SHA-256 thumbprint Node computes", () => {
    expect(x509.fingerprint256.replace(/:/g, "")).toBe(cert.thumbprintSha256);
  });

  it("is valid from just before now until validityDays later", () => {
    expect(new Date(x509.validFrom).getTime()).toBeLessThanOrEqual(now.getTime());
    expect(new Date(x509.validTo).toISOString()).toBe(cert.notAfter.toISOString());
    expect(cert.notAfter.getTime() - now.getTime()).toBe(365 * 24 * 60 * 60 * 1000);
  });

  it("pairs the certificate with the returned private key", () => {
    const data = Buffer.from("client-assertion");
    const sig = sign("sha256", data, createPrivateKey(cert.privateKeyPem));
    expect(verify("sha256", data, x509.publicKey, sig)).toBe(true);
    expect(
      createPublicKey(cert.privateKeyPem).export({ type: "spki", format: "der" }).equals(
        x509.publicKey.export({ type: "spki", format: "der" }),
      ),
    ).toBe(true);
  });

  it("issues a distinct key pair and serial each call", () => {
    const other = generateSelfSignedCertificate("PatchPilot-test", 365, now);
    expect(other.thumbprintSha256).not.toBe(cert.thumbprintSha256);
    expect(new X509Certificate(other.certificatePem).serialNumber).not.toBe(x509.serialNumber);
  });
});
