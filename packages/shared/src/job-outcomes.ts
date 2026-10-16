/**
 * Which failed jobs are a PatchPilot remediation failing, and which are
 * PatchPilot declining or being unable to act at all.
 *
 * Both end as status "failed" — the device is still vulnerable either way, and
 * the Jobs page must keep saying so — but only the first says anything about
 * how well remediation works. Counting "no winget package is mapped for this
 * software" or "the vulnerable copy is bundled inside Visual Studio" as failed
 * runs dragged the dashboard's success rate down for things no retry, and no
 * fix to PatchPilot's own dispatch, could ever change.
 *
 * Lives in `shared` because the API (dashboard metrics) and the web Jobs page
 * (the "Needs attention" chip) must draw the line in the same place. Keep this
 * module free of any Node/Postgres import — it ships to the browser.
 */

import {
  WINGET_EXIT_INSTALL_TECHNOLOGY_MISMATCH,
  WINGET_EXIT_NOT_VISIBLE,
  WINGET_EXIT_NOT_WINGET_MANAGED,
} from "./scripts.js";

/**
 * Text every executor refusal carries in its output — see `notPerformed` in
 * apps/worker/src/executor.ts, which builds `${label}: no write performed — ${reason}`.
 * Matched on the output because refusals share exit code 1 with real failures,
 * and the historical rows already in the jobs table can only be told apart this way.
 */
export const NOT_PERFORMED_MARKER = ": no write performed — ";

/**
 * Live Response library-script verdicts for an upgrade PatchPilot can't
 * complete on its own: the device still needs a person, and retrying won't
 * change the result. See each constant in scripts.ts.
 */
export const MANUAL_ACTION_EXIT_CODES: readonly number[] = [
  WINGET_EXIT_NOT_WINGET_MANAGED,
  WINGET_EXIT_INSTALL_TECHNOLOGY_MISMATCH,
  WINGET_EXIT_NOT_VISIBLE,
];

export interface JobOutcomeFields {
  status: string;
  channel: string;
  exitCode: number | null;
  output: string | null;
}

/** A failed Live Response upgrade that ended on one of MANUAL_ACTION_EXIT_CODES. */
export function needsManualAction(job: JobOutcomeFields): boolean {
  return (
    job.status === "failed" &&
    job.channel === "live-response" &&
    job.exitCode !== null &&
    MANUAL_ACTION_EXIT_CODES.includes(job.exitCode)
  );
}

/** A failed job the executor refused before touching Microsoft at all. */
export function wasNotPerformed(job: JobOutcomeFields): boolean {
  return job.status === "failed" && (job.output?.includes(NOT_PERFORMED_MARKER) ?? false);
}

/**
 * A failed job that measures nothing about remediation itself — either never
 * attempted (wasNotPerformed) or one PatchPilot can't complete by design
 * (needsManualAction). Kept out of the success rate, and counted on its own.
 */
export function isNotActionable(job: JobOutcomeFields): boolean {
  return wasNotPerformed(job) || needsManualAction(job);
}
