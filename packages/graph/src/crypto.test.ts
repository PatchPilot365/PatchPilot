import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "./crypto.js";

const ADMIN_KEY = "pp:msalcache:admin@contoso.example";
const ENGINEER_KEY = "pp:msalcache:engineer@contoso.example";

describe("encrypt/decrypt", () => {
  it("round-trips without a context in the original three-part format", () => {
    const payload = encrypt("hello");
    expect(payload.split(".")).toHaveLength(3);
    expect(decrypt(payload)).toBe("hello");
  });

  it("round-trips a payload bound to its context", () => {
    const payload = encrypt("refresh-token-cache", ADMIN_KEY);
    expect(payload.startsWith("v2.")).toBe(true);
    expect(decrypt(payload, ADMIN_KEY)).toBe("refresh-token-cache");
  });

  it("refuses a bound payload moved under another key", () => {
    const payload = encrypt("refresh-token-cache", ADMIN_KEY);
    expect(() => decrypt(payload, ENGINEER_KEY)).toThrow();
  });

  it("refuses a bound payload read without a context", () => {
    expect(() => decrypt(encrypt("x", ADMIN_KEY))).toThrow("Bound ciphertext requires its context");
  });

  it("refuses a bound payload with its prefix stripped to pass as unbound", () => {
    const stripped = encrypt("refresh-token-cache", ADMIN_KEY).slice("v2.".length);
    expect(() => decrypt(stripped, ENGINEER_KEY)).toThrow();
  });

  it("still reads an unbound payload written before binding existed", () => {
    expect(decrypt(encrypt("legacy-cache"), ADMIN_KEY)).toBe("legacy-cache");
  });

  it("rejects malformed payloads", () => {
    expect(() => decrypt("a.b")).toThrow("Malformed ciphertext");
    expect(() => decrypt("v2.a.b.c.d", ADMIN_KEY)).toThrow("Malformed ciphertext");
    expect(() => decrypt("v3.a.b.c", ADMIN_KEY)).toThrow("Malformed ciphertext");
  });
});
