export interface QualityUpdateOptionsValue {
  displayName: string;
  catalogItemId: string;
  /** The chosen release's displayName, frozen at selection time — carried
   *  alongside `catalogItemId` because the group-campaign route needs a
   *  human-readable label without re-deriving it server-side. */
  releaseLabel: string;
  daysUntilForcedReboot: 0 | 1 | 2;
  /** Fix All only: an Entra group. Empty groupId = fix the checked devices
   *  individually (unchanged); set = create a group-targeted Intune campaign
   *  instead. Ignored by Fix Now. */
  groupId: string;
  groupName: string;
  excludeGroupId: string;
  excludeGroupName: string;
}

export function defaultQualityUpdateOptions(seed?: { kbId?: string }): QualityUpdateOptionsValue {
  return {
    displayName: seed?.kbId ? `PatchPilot Expedited Update - KB${seed.kbId}` : "",
    catalogItemId: "",
    releaseLabel: "",
    daysUntilForcedReboot: 2,
    groupId: "",
    groupName: "",
    excludeGroupId: "",
    excludeGroupName: "",
  };
}
