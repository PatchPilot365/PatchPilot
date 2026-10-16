import type { LocalDeviceGroup, LocalDeviceGroupMember } from "../lib/api";
import type { Target } from "./scheduleTarget";

const SEVERITIES = ["", "none", "low", "medium", "high", "critical"] as const;
const SEVERITY_LABELS: Record<(typeof SEVERITIES)[number], string> = {
  "": "Any severity",
  none: "None — also sweeps software with no CVE",
  low: "Low+",
  medium: "Medium+",
  high: "High+",
  critical: "Critical only",
};
const PATCH_TYPES: { id: "" | "app" | "os"; label: string }[] = [
  { id: "", label: "App fixes & OS updates" },
  { id: "app", label: "App fixes only" },
  { id: "os", label: "OS updates only" },
];

export const INPUT_CLASS =
  "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:border-slate-400 dark:focus:border-slate-600 focus:outline-none";

/** Target editor shared by the create-schedule popout and the per-row "Edit targeting" expand. */
export function ScheduleTargetFields({
  target,
  onChange,
  groups,
  members,
  onGroupChange,
}: {
  target: Target;
  onChange: (next: Target) => void;
  groups: LocalDeviceGroup[];
  /** Members of the currently-selected group, for the exclude multi-select. Empty when "All devices." */
  members: LocalDeviceGroupMember[];
  onGroupChange: (groupId: string) => void;
}) {
  return (
    <div className="space-y-3">
      {target.software && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
          Locked to <span className="font-medium">"{target.software}"</span> — this
          schedule was created from a Fix Now dialog and only ever targets
          that software. The scope below narrows devices, patch type, and
          severity on top of it.
        </div>
      )}
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Device group</label>
        <select
          className={INPUT_CLASS}
          value={target.deviceGroupId ?? ""}
          onChange={(e) => onGroupChange(e.target.value)}
        >
          <option value="">All devices</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} ({g.memberCount})
            </option>
          ))}
        </select>
      </div>

      {target.deviceGroupId && members.length > 0 && (
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
            Exclude from this schedule
          </label>
          <div className="max-h-32 overflow-y-auto rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900">
            {members.map((m) => {
              const excluded = target.excludedManagedDeviceIds?.includes(m.managedDeviceId) ?? false;
              return (
                <label
                  key={m.id}
                  className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 last:border-0"
                >
                  <input
                    type="checkbox"
                    checked={excluded}
                    onChange={(e) => {
                      const current = target.excludedManagedDeviceIds ?? [];
                      const next = e.target.checked
                        ? [...current, m.managedDeviceId]
                        : current.filter((id) => id !== m.managedDeviceId);
                      onChange({ ...target, excludedManagedDeviceIds: next.length ? next : undefined });
                    }}
                  />
                  {m.deviceHostname}
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Minimum severity level</label>
        <select
          className={INPUT_CLASS}
          value={target.severity ?? ""}
          onChange={(e) => onChange({ ...target, severity: e.target.value || undefined })}
        >
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {SEVERITY_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Patch type</label>
        <select
          className={INPUT_CLASS}
          value={target.patchType ?? ""}
          onChange={(e) =>
            onChange({ ...target, patchType: (e.target.value || undefined) as Target["patchType"] })
          }
        >
          {PATCH_TYPES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
