import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Tenant } from "./api";
import { ALL_TENANTS, TenantContext } from "./tenant";

export function TenantProvider({ children }: { children: ReactNode }) {
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["tenants"],
    queryFn: () => api.get<Tenant[]>("/api/tenants"),
  });

  // Only reachable tenants are switchable — a consent-needed/unreachable tenant
  // has no working token path, so selecting it would just surface empty data.
  // (Distinct from consentStatus: a "consented" GDAP relationship can still be
  // unreachable.) Sorted alphabetically for a stable dropdown order.
  const reachableTenants = useMemo(
    () =>
      [...tenants]
        .filter((t) => t.reachability === "reachable")
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [tenants],
  );

  // activeTenantId is the Entra tenant id (tenantId), NOT the uuid PK — it's the
  // key every data route filters on (devices/vulns/jobs all carry tenant_id).
  // Default to the alphabetically-first reachable tenant, falling back to the
  // aggregate "All Tenants" view when nothing is reachable yet.
  const defaultActive = reachableTenants[0]?.tenantId ?? ALL_TENANTS;
  const resolvedActive = activeTenantId ?? defaultActive;
  const isAllTenants = resolvedActive === ALL_TENANTS;

  const activeTenant = isAllTenants
    ? null
    : tenants.find((t) => t.tenantId === resolvedActive) ?? null;

  return (
    <TenantContext.Provider
      value={{
        tenants,
        reachableTenants,
        activeTenantId: resolvedActive,
        setActiveTenantId,
        activeTenant,
        isAllTenants,
        isLoading,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}
