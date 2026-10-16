// Client-side auth gate. The browser holds only a session cookie; it never sees
// a token. On load we ask the API who we are (`GET /auth/me`); a 401 means no
// session, so we show <LoginSplash /> — the engineer clicks its button to hand
// the browser to the API's `/auth/login` route, which starts the OIDC redirect
// to Microsoft. (No auto-redirect: a returning engineer who just signed out
// should land on a branded screen, not bounce straight back into Microsoft's
// login page.) In DEMO_MODE the API injects a demo engineer, so /auth/me
// succeeds and the gate is transparent.

import { useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError, setCsrfToken } from "./api";
import { AuthContext, type Engineer } from "./auth";
import { SetupPairing } from "../pages/setup/SetupPairing";
import { LoginSplash } from "../pages/auth/LoginSplash";

interface MeResponse {
  authenticated: boolean;
  entraConfigured?: boolean;
  demoMode?: boolean;
  engineer?: Engineer;
  csrfToken?: string;
}

function FullScreen({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="text-sm text-slate-500 dark:text-slate-400">{children}</div>
    </div>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => api.get<MeResponse>("/auth/me"),
    retry: false,
    staleTime: 5 * 60_000,
  });

  // Piggybacks on the boot-time /auth/me call rather than a separate
  // request: this fires before any mutating UI (rendered below, once
  // authenticated) is reachable.
  useEffect(() => {
    setCsrfToken(data?.csrfToken);
  }, [data?.csrfToken]);

  if (isLoading) {
    return <FullScreen>Checking your session…</FullScreen>;
  }

  // A never-paired instance has no Entra app registration to sign in against —
  // /auth/login would just bounce to a Microsoft error page. Show the pairing
  // setup screen instead of redirecting; it recovers on its own once pairing
  // completes (see SetupPairing's polling). This check must come before the
  // unauthenticated redirect below, since an unpaired instance is always also
  // unauthenticated — /auth/me 401s (no session), so the flag rides the
  // ApiError's parsed body (error.data), not the react-query `data` field,
  // which stays undefined on a thrown request.
  const entraConfigured =
    data?.entraConfigured ??
    (error instanceof ApiError && error.data && typeof error.data === "object"
      ? (error.data as { entraConfigured?: boolean }).entraConfigured
      : undefined);
  if (entraConfigured === false) {
    return <SetupPairing />;
  }

  // No session (401) or an explicit not-authenticated body → show the splash
  // screen. Clicking its button (not this gate) is what starts /auth/login.
  const unauthenticated =
    (isError && error instanceof ApiError && error.status === 401) ||
    (data != null && !data.authenticated);
  if (unauthenticated) {
    return <LoginSplash />;
  }

  // Any other error means the API itself is unreachable — surface it instead of
  // bouncing into a redirect loop.
  if (isError || !data?.engineer) {
    return (
      <FullScreen>
        Couldn&apos;t reach the PatchPilot API. Check that it&apos;s running, then
        reload.
      </FullScreen>
    );
  }

  const engineer: Engineer = { ...data.engineer, demoMode: data.demoMode ?? false };
  return <AuthContext.Provider value={engineer}>{children}</AuthContext.Provider>;
}
