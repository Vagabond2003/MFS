"use client";

import { useEffect } from "react";
import { Toaster } from "sonner";
import { AuthProvider } from "@/hooks/use-auth";
import { I18nProvider } from "@/hooks/use-i18n";
import type { Lang } from "@/lib/i18n/core";

/** Left behind in browsers by the removed in-browser demo mode. */
const LEGACY_DEMO_DB_KEY = "kosh.mock-db";

export function Providers({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  useEffect(() => {
    try {
      window.localStorage.removeItem(LEGACY_DEMO_DB_KEY);
    } catch {
      // Storage blocked (private mode etc.) — nothing to clean up.
    }
  }, []);

  return (
    <AuthProvider>
      <I18nProvider initialLang={lang}>
        {children}
        <Toaster
          position="top-center"
          richColors
          closeButton
          toastOptions={{ className: "font-sans" }}
        />
      </I18nProvider>
    </AuthProvider>
  );
}
