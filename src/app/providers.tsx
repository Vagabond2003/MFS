"use client";

import { useEffect } from "react";
import { Toaster } from "sonner";
import { AuthProvider } from "@/hooks/use-auth";

/** Left behind in browsers by the removed in-browser demo mode. */
const LEGACY_DEMO_DB_KEY = "kosh.mock-db";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    try {
      window.localStorage.removeItem(LEGACY_DEMO_DB_KEY);
    } catch {
      // Storage blocked (private mode etc.) — nothing to clean up.
    }
  }, []);

  return (
    <AuthProvider>
      {children}
      <Toaster
        position="top-center"
        richColors
        closeButton
        toastOptions={{ className: "font-sans" }}
      />
    </AuthProvider>
  );
}
