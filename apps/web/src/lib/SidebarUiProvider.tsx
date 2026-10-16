import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { SidebarUiContext } from "./sidebarUi";

const COLLAPSED_KEY = "pp:sidebar-collapsed";

export function SidebarUiProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Close the drawer on route change — a nav click should always land on the
  // page, not leave the overlay open behind it.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSED_KEY, String(next));
      } catch {
        // Best-effort — worst case it re-expands next load.
      }
      return next;
    });
  }

  return (
    <SidebarUiContext.Provider
      value={{
        collapsed,
        toggleCollapsed,
        mobileOpen,
        openMobile: () => setMobileOpen(true),
        closeMobile: () => setMobileOpen(false),
      }}
    >
      {children}
    </SidebarUiContext.Provider>
  );
}
