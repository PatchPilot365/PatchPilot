// Signed-in engineer context and hooks. The <AuthGate> that provides it lives
// in AuthGate.tsx (kept separate so Fast Refresh can hot-swap the component).

import { createContext, useContext } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Permission, Role } from "@patchpilot/shared";
import { api } from "./api";

export interface Engineer {
  upn: string;
  displayName: string;
  homeTenantId: string;
  role: Role;
  permissions: Permission[];
  /** Personal light/dark UI preference — see lib/theme.ts. */
  theme: "light" | "dark";
  /**
   * True when the whole API process is running in DEMO_MODE (fixture data
   * only, no real tenant). Not a per-engineer setting — every session gets
   * the same value while the instance is in this mode. Stitched onto
   * Engineer here (rather than a separate context) purely so app-shell
   * chrome can read it via the existing `useEngineer()` hook.
   */
  demoMode: boolean;
}

// Exported so tests can render components inside <AuthContext.Provider value={fakeEngineer}>
// to inject an arbitrary role/permission set without mocking the full /auth/me fetch.
export const AuthContext = createContext<Engineer | null>(null);

/** The signed-in engineer. Only valid inside <AuthGate>. */
export function useEngineer(): Engineer {
  const engineer = useContext(AuthContext);
  if (!engineer) {
    throw new Error("useEngineer must be used inside an authenticated <AuthGate>");
  }
  return engineer;
}

/** Whether the signed-in engineer holds `permission`. Only valid inside <AuthGate>. */
export function useCan(permission: Permission): boolean {
  const engineer = useEngineer();
  return engineer.permissions.includes(permission);
}

/**
 * Best-effort server logout. Returns a callback (not a bare function) because
 * it needs the QueryClient to tell <AuthGate> the session is gone — there's
 * no page reload anymore to force that discovery. After the POST resolves
 * (or fails; we log out client-side regardless), invalidating ["auth","me"]
 * refetches AuthGate's query, which will now 401 and swap to <LoginSplash />.
 */
export function useLogout(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void api
      .post("/auth/logout", {})
      .catch(() => undefined)
      .finally(() => {
        void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      });
  };
}
