import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "./env.js";

/**
 * AES-256-GCM at rest for cached Microsoft tokens. The key is derived from
 * TOKEN_ENCRYPTION_KEY so rotating the env var invalidates old ciphertext.
 *
 * Passing a `context` (the Redis key the ciphertext is stored under) binds the
 * ciphertext to it as GCM additional authenticated data: the blob then only
 * decrypts under that same key. Without this, anyone able to write to Redis
 * could copy one engineer's encrypted MSAL cache under their own UPN's key and
 * have PatchPilot act with the other engineer's refresh token. Bound payloads
 * carry a "v2." prefix; unprefixed ones are the original unbound format.
 */
const key = createHash("sha256").update(env.TOKEN_ENCRYPTION_KEY).digest();

const BOUND_PREFIX = "v2";

export function encrypt(plaintext: string, context?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  if (context !== undefined) cipher.setAAD(Buffer.from(context, "utf8"));
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const parts = [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")];
  return (context !== undefined ? [BOUND_PREFIX, ...parts] : parts).join(".");
}

/**
 * Decrypts either format. A bound ("v2.") payload must be given the context it
 * was encrypted with, or GCM authentication fails. An unbound payload is still
 * accepted even when a context is given, so caches written before binding
 * existed keep working until they're next rewritten (every write is bound).
 * Those can only predate this change, so the fallback ages out with the 90-day
 * MSAL cache TTL and can be removed in a later release.
 */
export function decrypt(payload: string, context?: string): string {
  const parts = payload.split(".");
  const bound = parts.length === 4 && parts[0] === BOUND_PREFIX;
  const [ivB64, tagB64, dataB64] = bound ? parts.slice(1) : parts;
  if (!ivB64 || !tagB64 || !dataB64 || parts.length !== (bound ? 4 : 3)) {
    throw new Error("Malformed ciphertext");
  }
  if (bound && context === undefined) {
    throw new Error("Bound ciphertext requires its context");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  if (bound) decipher.setAAD(Buffer.from(context!, "utf8"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

/** SHA-256 hex of a payload — used for audit log payload hashes (never store raw). */
export function payloadHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload ?? null)).digest("hex");
}

/**
 * SHA-256 hex of raw content (string or bytes). Used for the Live Response library
 * file name (content-addressed, so an unchanged script keeps the same name) and for
 * the audit descriptor of an upload (we hash the bytes, never store them raw).
 */
export function sha256Hex(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}
