import { Redis } from "ioredis";
import { env } from "./env.js";
import { encrypt, decrypt } from "./crypto.js";

/**
 * Server-side, encrypted token cache keyed by (engineer, tenant). The browser
 * NEVER receives a Microsoft token — only a session cookie. Tokens are stored
 * in Redis so they survive across api/worker processes and restarts.
 */
// lazyConnect: don't dial Redis until a token is actually stored/read. In
// DEMO_MODE the token cache is never touched, so no Redis is required at all.
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });

// Same rationale as apps/worker/src/queue.ts: an unhandled "error" event
// crashes the process. This client sits on the hot path of every token fetch
// during a remediation run, so a transient Redis error here must be logged,
// not fatal.
redis.on("error", (err) => console.error("[token-store] redis connection error:", err.message));

/**
 * Cache slot. "login" is the engineer's session/assertion token (audience =
 * PatchPilot API). "graph"/"defender" are the per-tenant downstream tokens minted
 * via OBO — keyed separately so a Defender token never clobbers a Graph token for
 * the same tenant (they have different audiences).
 */
export type TokenSlot = "login" | "graph" | "defender";

function key(engineerUpn: string, tenantId: string, slot: TokenSlot): string {
  return `pp:token:${engineerUpn}:${tenantId}:${slot}`;
}

export interface CachedToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // epoch ms
  scopes: string[];
}

export async function storeToken(
  engineerUpn: string,
  tenantId: string,
  token: CachedToken,
  slot: TokenSlot = "login",
): Promise<void> {
  const ttlSeconds = Math.max(60, Math.floor((token.expiresAt - Date.now()) / 1000) + 3600);
  // The ciphertext is bound to its own Redis key (see crypto.ts) so it can't be
  // replayed under another engineer's or tenant's key.
  const k = key(engineerUpn, tenantId, slot);
  await redis.set(k, encrypt(JSON.stringify(token), k), "EX", ttlSeconds);
}

export async function getToken(
  engineerUpn: string,
  tenantId: string,
  slot: TokenSlot = "login",
): Promise<CachedToken | null> {
  const k = key(engineerUpn, tenantId, slot);
  const raw = await redis.get(k);
  if (!raw) return null;
  return JSON.parse(decrypt(raw, k)) as CachedToken;
}

export async function clearTokens(engineerUpn: string): Promise<void> {
  const keys = await redis.keys(`pp:token:${engineerUpn}:*`);
  if (keys.length) await redis.del(...keys);
}

export { redis };
