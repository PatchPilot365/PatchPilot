import type { IntuneAssignmentMode } from "../lib/api";

export interface StoreAppDeployOptionsValue {
  displayName: string;
  description: string;
  publisher: string;
  runAsAccount: "system" | "user";
  assignmentMode: IntuneAssignmentMode;
  groupId: string;
  groupName: string;
  excludeGroupId: string;
  excludeGroupName: string;
}

export function defaultStoreAppDeployOptions(seed?: {
  name?: string;
  publisher?: string;
  packageId?: string;
}): StoreAppDeployOptionsValue {
  return {
    displayName: seed?.name ?? "",
    description: seed?.packageId ? `Deployed via PatchPilot — ${seed.packageId}` : "",
    publisher: seed?.publisher ?? "",
    runAsAccount: "system",
    assignmentMode: "none",
    groupId: "",
    groupName: "",
    excludeGroupId: "",
    excludeGroupName: "",
  };
}
