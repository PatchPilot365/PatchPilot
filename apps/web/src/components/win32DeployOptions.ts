import type { IntuneAssignmentMode } from "../lib/api";

export interface Win32DeployOptionsValue {
  displayName: string;
  description: string;
  publisher: string;
  runAsAccount: "system" | "user";
  // Chocolatey-specific install options — ignored server-side for other sources.
  installChoco: boolean;
  customRepo: string;
  customArguments: string;
  assignmentMode: IntuneAssignmentMode;
  groupId: string;
  groupName: string;
  excludeGroupId: string;
  excludeGroupName: string;
}

export function defaultWin32DeployOptions(seed?: {
  name?: string;
  publisher?: string;
  packageId?: string;
}): Win32DeployOptionsValue {
  return {
    displayName: seed?.name ?? "",
    description: seed?.packageId ? `Deployed via PatchPilot — ${seed.packageId}` : "",
    publisher: seed?.publisher ?? "",
    runAsAccount: "system",
    installChoco: true,
    customRepo: "",
    customArguments: "",
    assignmentMode: "none",
    groupId: "",
    groupName: "",
    excludeGroupId: "",
    excludeGroupName: "",
  };
}
