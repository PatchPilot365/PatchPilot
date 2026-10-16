import { createContext, useContext } from "react";
import type { Tenant } from "./api";

/**
 * Sentinel activeTenantId meaning "aggregate across every tenant". Data routes
 * return all rows when no tenantId query param is sent, so pages translate this
 * sentinel into an unfiltered request. It's a value that can never be a real
 * Entra tenant id, so it round-trips through the switcher safely.
 */
export const ALL_TENANTS = "__all__";

export interface TenantCtx {
  tenants: Tenant[];
  /** Only the tenants PatchPilot can actually reach — what the switcher offers. */
  reachableTenants: Tenant[];
  activeTenantId: string | null;
  setActiveTenantId: (id: string) => void;
  /** The selected tenant, or null when "All Tenants" (or nothing) is active. */
  activeTenant: Tenant | null;
  /** True when the aggregate "All Tenants" view is selected. */
  isAllTenants: boolean;
  isLoading: boolean;
}

// Provided by <TenantProvider> (TenantProvider.tsx).
export const TenantContext = createContext<TenantCtx | null>(null);

export function useTenant(): TenantCtx {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant must be used within TenantProvider");
  return ctx;
}
