export type ScopeStatus = "ok" | "skipped" | "failed";

// Colour-codes a scope pill by its last "Test Connection" result — green/OK,
// amber/skipped (published but not yet granted), rose/failed (not published
// on the resource's own service principal at all). Untested scopes (no
// status lookup hit) fall back to the original neutral slate pill.
export const SCOPE_STATUS_STYLES: Record<ScopeStatus, string> = {
  ok: "border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  skipped: "border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400",
  failed: "border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400",
};

export const SCOPE_STATUS_LABELS: Record<ScopeStatus, string> = {
  ok: "OK — granted and live",
  skipped: "Skipped — published but not yet granted; run Add API Permissions",
  failed: "Failed — not published on this resource's service principal",
};
