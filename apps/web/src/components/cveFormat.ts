import { isOsFinding, requiresManualRemediation } from "@patchpilot/shared";

/** Whole-number days since a timestamp, floored at 0. */
export function daysAgo(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** Short calendar date (e.g. "23 Jun 2026"); em-dash for null/invalid input. */
export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  return new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** EPSS probability (0..1) rendered as a whole-percent; em-dash when absent. */
export function formatEpss(epss: number | null): string {
  if (epss == null) return "—";
  return `${Math.round(epss * 100)}%`;
}

/**
 * Classifies how a finding would actually get fixed. `wingetRemediable` alone
 * can't tell "ships via Windows Update" apart from "bundled library, the
 * owning app has to ship it" or "just no winget package exists" — the live
 * matcher (buildWingetMatcher in apps/api/src/catalog/matching.ts) returns
 * false for all three. Shared by the Vulnerabilities page's "All CVEs" table
 * and the Devices detail panel's per-device CVE table so the two can't drift
 * out of sync with each other.
 */
export function remediationRoute(
  software: string,
  wingetRemediable: boolean,
): "winget" | "os" | "manual" | "unsupported" {
  if (wingetRemediable) return "winget";
  if (isOsFinding(software)) return "os";
  if (requiresManualRemediation(software)) return "manual";
  return "unsupported";
}
