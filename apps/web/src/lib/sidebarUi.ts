// Desktop collapse (persisted) and mobile drawer (ephemeral) state for the
// Sidebar. Deliberately localStorage, not server-side, unlike theme.ts's
// engineer-level preference — this is browser-local UI chrome, not a
// cross-device identity attribute (see lib/theme.ts's header comment on why
// *that* preference follows the engineer instead).

import { createContext, useContext } from "react";

export interface SidebarUiContextValue {
  collapsed: boolean;
  toggleCollapsed: () => void;
  mobileOpen: boolean;
  openMobile: () => void;
  closeMobile: () => void;
}

// Provided by <SidebarUiProvider> (SidebarUiProvider.tsx).
export const SidebarUiContext = createContext<SidebarUiContextValue | null>(null);

export function useSidebarUi(): SidebarUiContextValue {
  const ctx = useContext(SidebarUiContext);
  if (!ctx) {
    throw new Error("useSidebarUi must be used within SidebarUiProvider");
  }
  return ctx;
}
