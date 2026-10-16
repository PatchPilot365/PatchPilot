/**
 * Defender remediation types PatchPilot can actually drive. "Update" installs a
 * newer package and "Uninstall" removes it — both map to a Run Now flow.
 * "AttentionRequired" is Defender's own signal that there is no package to act
 * on (the vulnerable code is a component bundled inside another app), and
 * "ConfigurationChange" is a misconfiguration handled in Intune/Group Policy.
 * An unrecognised type is treated as unsupported rather than silently offered.
 */
export const REMEDIABLE_TYPES = new Set(["update", "uninstall"]);

/**
 * Defender returns remediation types as PascalCase tokens ("AttentionRequired",
 * "ConfigurationChange"); the portal renders them spaced and sentence-cased, so
 * we match it rather than leaking the raw API token into the table.
 */
export function prettyRemediationType(type: string | null | undefined): string {
  if (!type) return "—";
  const spaced = type.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

export function isRemediableType(type: string | null | undefined): boolean {
  return REMEDIABLE_TYPES.has((type ?? "").toLowerCase());
}
