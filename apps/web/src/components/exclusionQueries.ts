import type { QueryClient } from "@tanstack/react-query";

/**
 * Every query an exclusion can move, invalidated on both create and stop.
 *
 * Much broader than `ExceptionModal`'s five keys: an exception hides one
 * finding, but excluding a device removes it — and its share of every exposure
 * count — from the device list, both fleet-wide finding lists, all four
 * per-device tabs, both inventories, missing KBs, both catalogs and the
 * dashboard's KPIs. Exported so the "Stop exclusion" path can't drift from
 * the create path.
 */
export function invalidateExclusionQueries(
  queryClient: QueryClient,
): void {
  for (const key of [
    "devices",
    "device-exclusions",
    "vulnerabilities",
    "recommendations",
    "device-vulnerabilities",
    "device-recommendations",
    "device-software-inventory",
    "device-missing-kbs",
    "software-inventory",
    "missing-kbs",
    "catalog",
    "chocolatey-catalog",
    "dashboard",
  ]) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}
