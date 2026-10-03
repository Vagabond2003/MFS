"use client";

import { Languages } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { LANGS, type Lang } from "@/lib/i18n/core";
import { cn } from "@/lib/utils";

const SHORT: Record<Lang, string> = { en: "EN", bn: "বাংলা" };

/** English ⇄ Bengali switch. Signed-in users get the choice saved to their account. */
export function LanguageToggle({ tone = "light", className }: { tone?: "light" | "dark"; className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div
      role="radiogroup"
      aria-label={t("Interface language")}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-xl p-0.5 text-xs font-semibold",
        tone === "dark" ? "bg-white/10 text-slate-300" : "bg-slate-100 text-slate-500",
        className,
      )}
    >
      <Languages className="mx-1 h-3.5 w-3.5 text-slate-400" aria-hidden />
      {LANGS.map((l) => {
        const active = l === lang;
        return (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={active}
            lang={l}
            onClick={() => void setLang(l)}
            className={cn(
              "rounded-lg px-2 py-1 transition",
              active
                ? "bg-white text-slate-900 shadow-sm"
                : tone === "dark"
                  ? "hover:text-white"
                  : "hover:text-slate-900",
            )}
          >
            {SHORT[l]}
          </button>
        );
      })}
    </div>
  );
}
