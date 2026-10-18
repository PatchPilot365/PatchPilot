import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";

/**
 * Minimal self-signed X.509 certificate builder for PatchPilot's Entra app
 * credential (see credential.ts). Node can generate an RSA key pair but has no
 * certificate builder, and Entra's keyCredentials only accept an X.509
 * certificate (type AsymmetricX509Cert), not a bare public key. Hand-rolling
 * the DER for this one fixed shape keeps a whole ASN.1/PKI dependency
 * (node-forge, @peculiar/x509) out of the supply chain for ~100 lines of
 * well-specified encoding. The output is checked in x509.test.ts with Node's
 * own `crypto.X509Certificate` parser, including the self-signature.
 *
 * Entra only uses the certificate as a container for the public key — it
 * never chains it to a CA — so self-signed is the documented normal case.
 */

function derLength(len: number): Buffer {
  if (len < 0x80) return Buffer.from([len]);
  const bytes: number[] = [];
  for (let n = len; n > 0; n >>= 8) bytes.unshift(n & 0xff);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function tlv(tag: number, ...content: Buffer[]): Buffer {
  const body = Buffer.concat(content);
  return Buffer.concat([Buffer.from([tag]), derLength(body.length), body]);
}

const seq = (...c: Buffer[]) => tlv(0x30, ...c);
const set = (...c: Buffer[]) => tlv(0x31, ...c);

function oid(dotted: string): Buffer {
  const [a, b, ...rest] = dotted.split(".").map(Number);
  const bytes = [a! * 40 + b!];
  for (const part of rest) {
    const chunk: number[] = [];
    let n = part;
    do {
      chunk.unshift(n & 0x7f);
      n = Math.floor(n / 128);
    } while (n > 0);
    for (let i = 0; i < chunk.length - 1; i++) chunk[i]! |= 0x80;
    bytes.push(...chunk);
  }
  return tlv(0x06, Buffer.from(bytes));
}

function positiveInteger(bytes: Buffer): Buffer {
  // DER INTEGER is two's complement: a leading 1 bit would read as negative.
  const body = bytes[0]! & 0x80 ? Buffer.concat([Buffer.from([0]), bytes]) : bytes;
  return tlv(0x02, body);
}

/** UTCTime (YYMMDDHHMMSSZ) — valid for every date up to 2049, which covers any cert this issues. */
function utcTime(d: Date): Buffer {
  const iso = d.toISOString(); // 2026-10-18T05:06:07.000Z
  const s = iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10) + iso.slice(11, 13) + iso.slice(14, 16) + iso.slice(17, 19) + "Z";
  return tlv(0x17, Buffer.from(s, "ascii"));
}

function name(commonName: string): Buffer {
  return seq(set(seq(oid("2.5.4.3"), tlv(0x0c, Buffer.from(commonName, "utf8")))));
}

const SHA256_WITH_RSA = seq(oid("1.2.840.113549.1.1.11"), Buffer.from([0x05, 0x00]));

export interface SelfSignedCertificate {
  /** PEM-encoded certificate — public, safe to embed in the pairing script and upload to Entra. */
  certificatePem: string;
  /** PKCS#8 PEM private key. Never leaves the instance; store it encrypted. */
  privateKeyPem: string;
  /** Uppercase hex SHA-256 of the certificate DER — what MSAL's clientCertificate.thumbprintSha256 expects. */
  thumbprintSha256: string;
  notAfter: Date;
}

export function generateSelfSignedCertificate(
  commonName: string,
  validityDays = 365,
  now: Date = new Date(),
): SelfSignedCertificate {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const spki = publicKey.export({ type: "spki", format: "der" });

  const serial = randomBytes(16);
  serial[0] = (serial[0]! & 0x7f) | 0x01; // positive and non-zero leading byte
  // Backdated a few minutes so a host with a slightly slow clock doesn't
  // present a not-yet-valid certificate.
  const notBefore = new Date(now.getTime() - 5 * 60 * 1000);
  const notAfter = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);

  const extensions = tlv(
    0xa3,
    seq(
      // basicConstraints: CA:false (empty SEQUENCE)
      seq(oid("2.5.29.19"), tlv(0x04, seq())),
      // keyUsage (critical): digitalSignature — the only thing a client assertion needs
      seq(oid("2.5.29.15"), tlv(0x01, Buffer.from([0xff])), tlv(0x04, tlv(0x03, Buffer.from([0x07, 0x80])))),
    ),
  );

  const tbs = seq(
    tlv(0xa0, positiveInteger(Buffer.from([0x02]))), // version v3
    positiveInteger(serial),
    SHA256_WITH_RSA,
    name(commonName),
    seq(utcTime(notBefore), utcTime(notAfter)),
    name(commonName),
    spki,
    extensions,
  );
  const signature = sign("sha256", tbs, privateKey);
  const der = seq(tbs, SHA256_WITH_RSA, tlv(0x03, Buffer.from([0x00]), signature));

  const b64 = der.toString("base64").replace(/(.{64})/g, "$1\n").trimEnd();
  return {
    certificatePem: `-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----\n`,
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    thumbprintSha256: createHash("sha256").update(der).digest("hex").toUpperCase(),
    notAfter,
  };
}
