/**
 * Remediation timing limits that have to agree with each other, kept in one
 * place so changing one can't silently break the ordering the others rely on:
 *
 *   POLL_TIMEOUT_MS (live-response.ts, 10 min)
 *     < REMEDIATION_JOB_TIMEOUT_MS (13 min: the poll window plus library
 *       checks, dispatch and fetching the result)
 *     < + REMEDIATION_CANCEL_GRACE_MS (1 min to cancel what was dispatched)
 *     < DEVICE_LOCK_TIMEOUT_MS (live-response.ts, 15 min lock TTL)
 *
 * The job limit is only counted while the job has its turn on the device —
 * see JobDeadline — so it doesn't grow with the number of jobs queued for one
 * device; the lock *wait* does, and is sized from REMEDIATION_CONCURRENCY.
 */

/** Jobs the remediation worker runs at once (BullMQ Worker concurrency). */
export const REMEDIATION_CONCURRENCY = 5;

/**
 * Backstop above every timeout internal to `executeRemediation` (e.g. the
 * live-response channel's own polling bound, or `graphGet`/`graphWrite`'s
 * 30s-per-request bound). Guarantees the job always reaches a terminal DB status
 * instead of parking at "running" forever — the failure mode a live "Run Now"
 * hit in production before these timeouts existed.
 */
export const REMEDIATION_JOB_TIMEOUT_MS = 13 * 60_000;

/**
 * How long a job that hit its limit gets to wind down before the worker stops
 * waiting for it: long enough for one in-flight Graph call (30s bound) plus the
 * cancel request for a dispatched Defender action (another 30s).
 */
export const REMEDIATION_CANCEL_GRACE_MS = 60_000;
