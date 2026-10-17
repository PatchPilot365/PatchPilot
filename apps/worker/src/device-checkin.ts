import { isCheckinStale } from "@patchpilot/shared";

/**
 * Whether a device has checked in recently enough to be worth a Live Response
 * dispatch.
 *
 * Live Response only works while the device is online: an action sent to an
 * offline device sits "Pending" until Defender times it out, holds the device
 * lock and a job slot for the whole poll window, and then fails as if
 * remediation had broken. A device that hasn't checked in within the window
 * is skipped before anything is sent, as a "no write performed" refusal, so
 * it doesn't count against the success rate (see isNotActionable in shared).
 *
 * The window is a rolling 24 hours rather than a calendar day. PatchPilot has
 * no single timezone (schedules each carry their own, and ad-hoc jobs carry
 * none), and a calendar-day cut would skip a device seen an hour before
 * midnight by a job that runs an hour after it.
 */
export { CHECKIN_WINDOW_MS } from "@patchpilot/shared";

export type CheckinVerdict =
  | { recent: true }
  | { recent: false; reason: string };

/**
 * `lastSeen` is the freshest check-in time available: Defender's live answer
 * when the lookup worked, otherwise the time stored at the last sync. `source`
 * names which one, for the reason text.
 */
export function checkinVerdict(
  hostname: string,
  lastSeen: Date | null,
  source: string,
  now: Date = new Date(),
): CheckinVerdict {
  if (lastSeen === null) {
    return {
      recent: false,
      reason: `${hostname} has no recorded check-in (${source}), so it is probably offline and Live Response would only time out. Skipped without contacting the device. Retry once the device is back online.`,
    };
  }
  if (!isCheckinStale(lastSeen, now)) return { recent: true };
  return {
    recent: false,
    reason: `${hostname} last checked in ${lastSeen.toISOString()} (${source}), more than 24 hours ago, so it is probably offline and Live Response would only time out. Skipped without contacting the device. Retry once the device is back online.`,
  };
}
