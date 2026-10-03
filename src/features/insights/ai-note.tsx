"use client";

import { FileText, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/feedback";
import { useI18n } from "@/hooks/use-i18n";
import { cn, formatRelative } from "@/lib/utils";
import type { AiMeta, AiText } from "@/types/domain";

/**
 * Where an insight's wording came from. Language-model text is always labelled
 * "AI-generated" with its generation time; the fixed fallback says so too.
 * The figures themselves are always computed by Kosh, never by the model.
 */
export function AiSource({ meta, tone = "light", className }: { meta: AiMeta; tone?: "light" | "dark"; className?: string }) {
  const { t, lang } = useI18n();
  const dark = tone === "dark";
  const when = formatRelative(meta.generatedAt, lang);
  return (
    <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-xs", dark ? "text-slate-400" : "text-slate-500", className)}>
      {meta.source === "AI" ? (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ring-1 ring-inset",
            dark ? "bg-violet-500/15 text-violet-200 ring-violet-400/30" : "bg-violet-50 text-violet-700 ring-violet-200",
          )}
        >
          <Sparkles className="h-3 w-3" aria-hidden />
          {t("AI-generated")}
        </span>
      ) : (
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ring-1 ring-inset", dark ? "bg-white/5 text-slate-300 ring-white/10" : "bg-slate-100 text-slate-600 ring-slate-200")}>
          <FileText className="h-3 w-3" aria-hidden />
          {t("Automatic summary")}
        </span>
      )}
      <span>
        {meta.source === "AI" ? t("Written {when} from Kosh's figures", { when }) : t("Prepared {when} from Kosh's figures", { when })}
      </span>
    </p>
  );
}

/** A short AI (or template) paragraph with its source line. */
export function AiTextBlock({ note, tone = "light", className, loading }: { note?: AiText; tone?: "light" | "dark"; className?: string; loading?: boolean }) {
  const dark = tone === "dark";
  if (!note) {
    return loading === false ? null : (
      <div className={cn("space-y-2", className)}>
        <Skeleton className={cn("h-4 w-full", dark && "bg-white/10")} />
        <Skeleton className={cn("h-4 w-2/3", dark && "bg-white/10")} />
      </div>
    );
  }
  return (
    <div className={className}>
      <p className={cn("text-[15px] leading-relaxed", dark ? "text-slate-100" : "text-slate-800")}>{note.text}</p>
      <AiSource meta={note} tone={tone} className="mt-2" />
    </div>
  );
}
