// Per-engineer light/dark preference (Settings has none for this — it's
// personal, not tenant-wide, so it lives on the engineer's own row via
// PATCH /auth/me/theme, not in @patchpilot/db's `settings` table).
//
// Initialized from the authenticated engineer (GET /auth/me), applied as a
// `dark` class on <html> (see index.css's `@custom-variant dark`), and kept
// in sync with the server so the preference follows an engineer across
// devices/browsers rather than living only in this one's localStorage.

import { createContext, useContext } from "react";

export type Theme = "light" | "dark";

export interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
}

// Provided by <ThemeProvider> (ThemeProvider.tsx).
export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return ctx;
}
