import { Suspense, type ReactNode } from "react";
import { Routes, Route, Outlet, Navigate } from "react-router-dom";
import type { Permission } from "@patchpilot/shared";
import { Sidebar } from "./components/Sidebar";
import { MobileSidebarDrawer } from "./components/MobileSidebarDrawer";
import { TenantSwitcher } from "./components/TenantSwitcher";
import { TenantProvider } from "./lib/TenantProvider";
import { useEngineer, useCan, useLogout } from "./lib/auth";
import { AuthGate } from "./lib/AuthGate";
import { ThemeProvider, ThemeToggle } from "./lib/ThemeProvider";
import { useSidebarUi } from "./lib/sidebarUi";
import { SidebarUiProvider } from "./lib/SidebarUiProvider";
import { useApplyBrandingVars } from "./lib/branding";
import { lazyPage } from "./lib/lazyPage";
import { PageHeader, Placeholder } from "./components/ui";
import { ChatWidget } from "./components/ai/ChatWidget";
import { UpdateAvailableBanner } from "./components/UpdateAvailableBanner";

// Each page is its own chunk, fetched on first visit (see lib/lazyPage.ts).
const Dashboard = lazyPage(() => import("./pages/dashboard/Dashboard"), "Dashboard");
const Vulnerabilities = lazyPage(() => import("./pages/Vulnerabilities"), "Vulnerabilities");
const Recommendations = lazyPage(() => import("./pages/Recommendations"), "Recommendations");
const Devices = lazyPage(() => import("./pages/Devices"), "Devices");
const Branding = lazyPage(() => import("./pages/settings/Branding"), "Branding");
const Sla = lazyPage(() => import("./pages/settings/Sla"), "Sla");
const Notifications = lazyPage(() => import("./pages/settings/Notifications"), "Notifications");
const WindowsUpdatePolicies = lazyPage(() => import("./pages/settings/WindowsUpdatePolicies"), "WindowsUpdatePolicies");
const Tenants = lazyPage(() => import("./pages/settings/Tenants"), "Tenants");
const License = lazyPage(() => import("./pages/settings/License"), "License");
const Updates = lazyPage(() => import("./pages/settings/Updates"), "Updates");
const ServerHealth = lazyPage(() => import("./pages/settings/ServerHealth"), "ServerHealth");
const SetupHealth = lazyPage(() => import("./pages/setup/SetupHealth"), "SetupHealth");
const AppRegistration = lazyPage(() => import("./pages/setup/AppRegistration"), "AppRegistration");
const ArchitecturePage = lazyPage(() => import("./pages/setup/architecture/ArchitecturePage"), "ArchitecturePage");
const Catalog = lazyPage(() => import("./pages/Catalog"), "Catalog");
const ChocolateyCatalog = lazyPage(() => import("./pages/ChocolateyCatalog"), "ChocolateyCatalog");
const ScriptCatalog = lazyPage(() => import("./pages/ScriptCatalog"), "ScriptCatalog");
const Schedules = lazyPage(() => import("./pages/Schedules"), "Schedules");
const DeviceGroups = lazyPage(() => import("./pages/DeviceGroups"), "DeviceGroups");
const Jobs = lazyPage(() => import("./pages/Jobs"), "Jobs");
const SoftwareInventory = lazyPage(() => import("./pages/SoftwareInventory"), "SoftwareInventory");
const AuditLog = lazyPage(() => import("./pages/AuditLog"), "AuditLog");
const RemediationHistory = lazyPage(() => import("./pages/RemediationHistory"), "RemediationHistory");
const Users = lazyPage(() => import("./pages/settings/Users"), "Users");
const Reports = lazyPage(() => import("./pages/Reports"), "Reports");
const Help = lazyPage(() => import("./pages/Help"), "Help");

/** Suspense fallback while a page's chunk downloads — usually a few frames. */
function PageLoading() {
  return <div className="text-sm text-slate-400">Loading…</div>;
}

/**
 * Persistent reminder that everything on screen is fictional sample data —
 * nothing today told a viewer mid-session that this instance never talks to
 * a real tenant, and demo mode is now one click away from the Pairing Page
 * (see SetupPairing.tsx) for anyone with a link to it.
 */
function DemoModeBadge() {
  const { demoMode } = useEngineer();
  if (!demoMode) return null;
  return (
    <span
      title="This instance is running in demo mode — all data shown is fictional sample data, not a real tenant."
      className="ml-3 shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-500/15 dark:text-amber-400"
    >
      Demo mode
    </span>
  );
}

function EngineerMenu() {
  const engineer = useEngineer();
  const logout = useLogout();
  return (
    <div className="flex min-w-0 items-center gap-3 text-sm">
      <ThemeToggle />
      <div className="min-w-0 text-right">
        <div className="truncate font-medium text-slate-700 dark:text-slate-200">
          {engineer.displayName}
        </div>
        <div className="hidden truncate text-xs text-slate-400 sm:block">{engineer.upn}</div>
      </div>
      <button
        type="button"
        onClick={logout}
        className="shrink-0 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        Sign out
      </button>
    </div>
  );
}

/** Hamburger toggle for the mobile nav drawer — hidden at `lg` and up, where
 *  the persistent `Sidebar` is visible instead. See lib/SidebarUiProvider.tsx. */
function MobileMenuButton() {
  const { openMobile } = useSidebarUi();
  return (
    <button
      type="button"
      onClick={openMobile}
      aria-label="Open navigation"
      className="mr-3 shrink-0 rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 lg:hidden dark:text-slate-400 dark:hover:bg-slate-800"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
        <path d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 10.5a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75ZM2 10a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 10Z" />
      </svg>
    </button>
  );
}

// Fails closed on a hand-typed URL, not just a hidden nav link — the server-side
// `requirePermission` guard is the real boundary (see packages/shared/src/rbac.ts),
// this just keeps the SPA from rendering a page the API will refuse anyway.
function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const allowed = useCan(permission);
  if (!allowed) {
    return (
      <div>
        <PageHeader title="Users" />
        <Placeholder note="You don't have access to this page." />
      </div>
    );
  }
  return <>{children}</>;
}

function Layout() {
  const canUseAi = useCan("ai:use");
  useApplyBrandingVars();
  return (
    <ThemeProvider>
      <SidebarUiProvider>
        <div className="flex">
          <Sidebar />
          <MobileSidebarDrawer />
          <div className="flex h-screen flex-1 flex-col overflow-hidden print:h-auto print:overflow-visible">
            <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 print:hidden sm:px-8 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex min-w-0 items-center">
                <MobileMenuButton />
                <TenantSwitcher />
                <DemoModeBadge />
              </div>
              <EngineerMenu />
            </header>
            <UpdateAvailableBanner />
            <main className="flex-1 overflow-y-auto bg-slate-50 px-4 py-7 sm:px-8 print:h-auto print:overflow-visible dark:bg-slate-950">
              <Suspense fallback={<PageLoading />}>
                <Outlet />
              </Suspense>
            </main>
          </div>
          {canUseAi && <ChatWidget />}
        </div>
      </SidebarUiProvider>
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <AuthGate>
      <TenantProvider>
        <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="vulnerabilities" element={<Vulnerabilities />} />
          <Route path="recommendations" element={<Recommendations />} />
          <Route path="devices" element={<Devices />} />
          <Route path="device-groups" element={<DeviceGroups />} />
          <Route
            path="windows-updates"
            element={<Navigate to="/settings/windows-updates" replace />}
          />
          <Route
            path="feature-update-campaigns"
            element={<Navigate to="/settings/windows-updates" replace />}
          />
          <Route path="schedules" element={<Schedules />} />
          <Route path="jobs" element={<Jobs />} />
          <Route path="software-inventory" element={<SoftwareInventory />} />
          <Route path="audit" element={<AuditLog />} />
          <Route path="remediation-history" element={<RemediationHistory />} />
          <Route path="reports" element={<Reports />} />
          <Route path="catalog" element={<Catalog />} />
          <Route path="catalog/chocolatey" element={<ChocolateyCatalog />} />
          <Route path="catalog/scripts" element={<ScriptCatalog />} />
          <Route path="setup/health" element={<SetupHealth />} />
          <Route
            path="setup/connections"
            element={<Navigate to="/setup/health?tab=connections" replace />}
          />
          <Route
            path="setup/readiness"
            element={<Navigate to="/setup/health?tab=readiness" replace />}
          />
          <Route
            path="setup/preflight"
            element={<Navigate to="/setup/health?tab=preflight" replace />}
          />
          <Route
            path="setup/app-registration"
            element={<AppRegistration />}
          />
          <Route path="setup/architecture" element={<ArchitecturePage />} />
          <Route path="settings/branding" element={<Branding />} />
          <Route path="settings/sla" element={<Sla />} />
          <Route path="settings/notifications" element={<Notifications />} />
          <Route
            path="settings/feature-updates"
            element={<Navigate to="/settings/windows-updates?tab=target-build" replace />}
          />
          <Route path="settings/windows-updates" element={<WindowsUpdatePolicies />} />
          <Route path="settings/tenants" element={<Tenants />} />
          <Route path="settings/license" element={<License />} />
          <Route path="settings/updates" element={<Updates />} />
          <Route path="settings/server-health" element={<ServerHealth />} />
          <Route path="help" element={<Help />} />
          <Route
            path="settings/users"
            element={
              <RequirePermission permission="users:manage">
                <Users />
              </RequirePermission>
            }
          />
        </Route>
        </Routes>
      </TenantProvider>
    </AuthGate>
  );
}
