import type { DashboardRemediation } from "../../lib/api";

/**
 * Subtitle for the Remediation throughput card. `successRate` is a 0–1
 * fraction from the API (the same field the PDF report formats), so it is
 * scaled to a percentage here. Not-actionable runs are left out of the run
 * count and the rate — as the API leaves them out — and named separately.
 */
export function remediationSubtitle(remediation: DashboardRemediation): string {
  const total = remediation.succeeded + remediation.failed;
  const notActionable =
    remediation.notActionable > 0 ? ` · ${remediation.notActionable} not actionable` : "";
  if (total === 0) {
    return remediation.notActionable > 0
      ? `No actionable remediation runs in this window${notActionable}`
      : "No remediation runs in this window";
  }
  const pct = Math.round((remediation.successRate ?? 0) * 100);
  return `${total} runs · ${pct}% success · ${remediation.failedLast24h} failed in last 24h${notActionable}`;
}
