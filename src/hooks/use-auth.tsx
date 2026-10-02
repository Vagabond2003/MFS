"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/services";
import type { CurrentUser, SessionInfo } from "@/types/domain";

type Status = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  status: Status;
  session: SessionInfo | null;
  user: CurrentUser | null;
  /** Re-resolve the session from the server (the source of truth for role). */
  refresh: () => Promise<SessionInfo | null>;
  /** Store a session returned by a login call. */
  setSession: (s: SessionInfo) => void;
  signOut: (opts?: { everywhere?: boolean }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const UNAUTHENTICATED_EVENT = "kosh:unauthenticated";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ status: Status; session: SessionInfo | null }>({
    status: "loading",
    session: null,
  });

  const refresh = useCallback(
    () =>
      api.auth.me().then(
        (s) => {
          setState({ status: s ? "authenticated" : "unauthenticated", session: s });
          return s;
        },
        () => {
          setState({ status: "unauthenticated", session: null });
          return null;
        },
      ),
    [],
  );

  useEffect(() => {
    let alive = true;
    const load = () =>
      api.auth.me().then(
        (s) => alive && setState({ status: s ? "authenticated" : "unauthenticated", session: s }),
        () => alive && setState({ status: "unauthenticated", session: null }),
      );
    void load();
    const onFocus = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener(UNAUTHENTICATED_EVENT, load);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      alive = false;
      window.removeEventListener(UNAUTHENTICATED_EVENT, load);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  const setSession = useCallback((s: SessionInfo) => setState({ status: "authenticated", session: s }), []);

  const signOut = useCallback(async ({ everywhere = false }: { everywhere?: boolean } = {}) => {
    try {
      if (everywhere) await api.security.logoutAll();
      else await api.auth.logout();
    } finally {
      setState({ status: "unauthenticated", session: null });
      // Hard navigation on purpose: it clears all in-memory client state.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login?signedOut=1");
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, user: state.session?.user ?? null, refresh, setSession, signOut }),
    [state, refresh, setSession, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** For pages inside the authenticated app frame, where a user is guaranteed. */
export function useCurrentUser(): CurrentUser {
  const { user } = useAuth();
  if (!user) throw new Error("useCurrentUser called outside an authenticated area");
  return user;
}
