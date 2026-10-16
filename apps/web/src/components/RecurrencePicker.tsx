import { timeZoneOptions, describeTimeZone, toCron, describeRecurrence } from "./recurrence";
import { WEEKDAYS, type Recurrence } from "./recurrence";
import type { RecurrenceFrequency } from "./recurrence";

const FREQ_OPTIONS: { id: RecurrenceFrequency; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
];

/** IANA zone list for the picker — resolved once, it doesn't change mid-session. */
const TZ_OPTIONS = timeZoneOptions();

/**
 * Recurrence builder — Daily / Weekly / Monthly + time — for creating a
 * recurring `schedules` row inline. Emits a `Recurrence`; convert with
 * `toCron()` when posting to `/api/schedules`.
 */
export function RecurrencePicker({
  value,
  onChange,
}: {
  value: Recurrence;
  onChange: (r: Recurrence) => void;
}) {
  function toggleDay(day: number) {
    const has = value.daysOfWeek.includes(day);
    onChange({
      ...value,
      daysOfWeek: has
        ? value.daysOfWeek.filter((d) => d !== day)
        : [...value.daysOfWeek, day],
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {FREQ_OPTIONS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onChange({ ...value, freq: f.id })}
            className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
              value.freq === f.id
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {value.freq === "weekly" && (
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map((w) => {
            const active = value.daysOfWeek.includes(w.value);
            return (
              <button
                key={w.value}
                type="button"
                onClick={() => toggleDay(w.value)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                {w.label}
              </button>
            );
          })}
        </div>
      )}

      {value.freq === "monthly" && (
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Day of month</label>
          <select
            value={value.dayOfMonth}
            onChange={(e) => onChange({ ...value, dayOfMonth: Number(e.target.value) })}
            className="rounded-md border border-slate-300 dark:border-slate-700 px-2 py-1 text-xs text-slate-800 dark:text-slate-100 focus:border-slate-500 focus:outline-none"
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Time</label>
          <input
            type="time"
            value={value.time}
            onChange={(e) => onChange({ ...value, time: e.target.value })}
            className="rounded-md border border-slate-300 dark:border-slate-700 px-2 py-1 text-xs text-slate-800 dark:text-slate-100 focus:border-slate-500 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Timezone</label>
          <select
            value={value.timezone}
            onChange={(e) => onChange({ ...value, timezone: e.target.value })}
            className="rounded-md border border-slate-300 dark:border-slate-700 px-2 py-1 text-xs text-slate-800 dark:text-slate-100 focus:border-slate-500 focus:outline-none"
          >
            {(TZ_OPTIONS.includes(value.timezone)
              ? TZ_OPTIONS
              : [value.timezone, ...TZ_OPTIONS]
            ).map((tz) => (
              <option key={tz} value={tz}>
                {describeTimeZone(tz)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-[11px] leading-tight text-slate-500 dark:text-slate-400">
        {describeRecurrence(value)} · <code className="font-mono">{toCron(value)}</code> ·{" "}
        {describeTimeZone(value.timezone)}
      </p>
    </div>
  );
}
