/**
 * When a device counts as recently checked in, for Live Response.
 *
 * Live Response only works while the device is online, so the worker skips a
 * device not seen within this window before dispatching (apps/worker
 * device-checkin.ts, using Defender's live lastSeen). Pre-flight warns on the
 * same window and scheduled fan-outs leave such devices out, both from the
 * synced value. Shared so all three agree on the line.
 *
 * A rolling window rather than a calendar day: PatchPilot has no single
 * timezone, and a calendar-day cut would skip a device seen an hour before
 * midnight by a job that runs an hour after it.
 */
export const CHECKIN_WINDOW_MS = 24 * 60 * 60_000;

/** True when `lastSeen` is missing or older than CHECKIN_WINDOW_MS before `now`. */
export function isCheckinStale(lastSeen: Date | string | null, now: Date): boolean {
  if (lastSeen === null) return true;
  return now.getTime() - new Date(lastSeen).getTime() > CHECKIN_WINDOW_MS;
}
