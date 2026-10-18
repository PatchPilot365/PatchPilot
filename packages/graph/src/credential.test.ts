import { describe, expect, it } from "vitest";
import { describeEntraCredential, getMsalCredential } from "./credential.js";
import { generateSelfSignedCertificate } from "./x509.js";

const base = {
  ENTRA_CLIENT_SECRET: "s3cret",
  ENTRA_CERTIFICATE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
  ENTRA_CERTIFICATE_THUMBPRINT_SHA256: "AB".repeat(32),
};

describe("getMsalCredential", () => {
  it("returns only the client secret for the secret type", () => {
    expect(getMsalCredential({ ...base, ENTRA_CREDENTIAL_TYPE: "secret" })).toEqual({ clientSecret: "s3cret" });
  });

  it("returns only the certificate for the certificate type, never the secret", () => {
    const cred = getMsalCredential({ ...base, ENTRA_CREDENTIAL_TYPE: "certificate" });
    expect(cred).toEqual({
      clientCertificate: {
        thumbprintSha256: base.ENTRA_CERTIFICATE_THUMBPRINT_SHA256,
        privateKey: base.ENTRA_CERTIFICATE_PRIVATE_KEY,
      },
    });
    expect(cred).not.toHaveProperty("clientSecret");
  });
});

describe("describeEntraCredential", () => {
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
