import type { LocalDeviceGroup } from "../lib/api";

/** The `target` jsonb this UI reads/writes — mirrors ScheduleTarget in packages/shared. */
export interface Target {
  severity?: string;
  patchType?: "app" | "os";
  deviceGroupId?: string;
  excludedManagedDeviceIds?: string[];
  /** Set only by RunNowModal's Automated tab — locks the schedule to one software title. Not editable here. */
  software?: string;
}

export const CHANNELS: { id: string; label: string }[] = [
  { id: "live-response", label: "Defender Live Response" },
  { id: "intune-remediation", label: "On-demand Intune Remediation" },
  { id: "win32-app", label: "Intune (Win32 app)" },
  { id: "expedited-quality-update", label: "Expedited Quality Update" },
];

export const CHANNEL_LABELS: Record<string, string> = Object.fromEntries(
  CHANNELS.map((c) => [c.id, c.label]),
);

export function summarizeTarget(target: Record<string, unknown>, groups: LocalDeviceGroup[]): string {
  const t = target as Target;
  const parts: string[] = [];
  if (t.software) parts.push(`only "${t.software}"`);
  if (t.deviceGroupId) {
    const g = groups.find((g) => g.id === t.deviceGroupId);
    parts.push(g ? `group "${g.name}"` : "an unknown/deleted group");
  } else {
    parts.push("all devices");
  }
  if (t.excludedManagedDeviceIds?.length) {
    parts.push(`${t.excludedManagedDeviceIds.length} excluded`);
  }
  if (t.severity === "none") parts.push("none (includes non-CVE software)");
  else if (t.severity) parts.push(`${t.severity}+ severity`);
  if (t.patchType) parts.push(t.patchType === "app" ? "app fixes only" : "OS updates only");
  return parts.join(" · ");
}
