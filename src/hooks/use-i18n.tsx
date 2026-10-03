"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api, errorMessage } from "@/services";
import { LANG_COOKIE, translator, type Lang, type Translate } from "@/lib/i18n/core";
import { useAuth } from "./use-auth";

interface I18nContextValue {
  lang: Lang;
  /** Translate English source text into the interface language. */
  t: Translate;
  /** Switch language; signed-in users also get it saved to their account. */
  setLang: (lang: Lang) => Promise<void>;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const ONE_YEAR = 60 * 60 * 24 * 365;

export function I18nProvider({ initialLang, children }: { initialLang: Lang; children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const router = useRouter();
  const { user, refresh } = useAuth();

  // A signed-in user's saved language follows them to every device: adopt it
  // once per sign-in. Later toggles are saved to the account, so they agree.
  const userId = user?.id ?? null;
  const [syncedUserId, setSyncedUserId] = useState<string | null>(null);
  if (userId !== syncedUserId) {
    setSyncedUserId(userId);
    if (user?.language && user.language !== lang) setLangState(user.language);
  }

  // Keep the cookie (read by the server) and <html lang> in step with the language.
  const renderedLang = useRef(initialLang);
  useEffect(() => {
    document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
    document.documentElement.lang = lang;
    if (renderedLang.current !== lang) {
      renderedLang.current = lang;
      // Server-rendered parts (page titles, static pages) re-render in the new language.
      router.refresh();
    }
  }, [lang, router]);

  const setLang = useCallback(
    async (next: Lang) => {
      if (next === lang) return;
      setLangState(next);
      if (!user) return;
      try {
        await api.profile.update({ language: next });
        await refresh();
      } catch (e) {
        toast.error(translator(next)(errorMessage(e)));
      }
    },
    [lang, user, refresh],
  );

  const value = useMemo<I18nContextValue>(() => ({ lang, t: translator(lang), setLang }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
