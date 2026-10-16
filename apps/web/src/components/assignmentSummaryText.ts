import type { IntuneAssignmentSummary } from "../lib/api";

/** Plain-text form for CSV export — no JSX. */
export function assignmentSummaryText(assignments: IntuneAssignmentSummary[]): string {
  if (assignments.length === 0) return "";
  const includes = assignments.filter((a) => a.kind === "include");
  const excludes = assignments.filter((a) => a.kind === "exclude");
  const parts: string[] = [];
  if (assignments.some((a) => a.kind === "all-devices")) parts.push("All devices");
  if (assignments.some((a) => a.kind === "all-users")) parts.push("All users");
  parts.push(...includes.map((a) => a.groupName || a.groupId || "Unknown group"));
  let text = parts.join(", ");
  if (excludes.length > 0) {
    text += ` (excl. ${excludes.map((a) => a.groupName || a.groupId || "unknown").join(", ")})`;
  }
  return text;
}
