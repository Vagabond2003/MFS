"use client";

import { CircleCheck, CircleX, FileText, ImageIcon, Search, Send, ShieldAlert } from "lucide-react";
import { AccountStatusBadge, DocumentStatusBadge } from "@/components/ui/badge";
import { cn, formatDate, formatDateTime, titleCase } from "@/lib/utils";
import type { AccountStatus, StatusEvent, VerificationDocument } from "@/types/domain";
import { useI18n } from "@/hooks/use-i18n";
import { msg } from "@/lib/i18n/core";

type Track = "AGENT" | "MERCHANT";

const STAGES: Record<Track, { status: AccountStatus[]; label: string; icon: typeof Send }[]> = {
  AGENT: [
    { status: ["APPLICATION_SUBMITTED"], label: msg("Application submitted"), icon: Send },
    { status: ["UNDER_REVIEW"], label: msg("Under review"), icon: Search },
    { status: ["VERIFIED", "REJECTED"], label: msg("Decision"), icon: CircleCheck },
  ],
  MERCHANT: [
    { status: ["PENDING"], label: msg("Pending"), icon: Send },
    { status: ["UNDER_REVIEW"], label: msg("Under review"), icon: Search },
    { status: ["VERIFIED", "REJECTED"], label: msg("Decision"), icon: CircleCheck },
  ],
};

/** Horizontal progress through the verification lifecycle. */
export function VerificationProgress({ track, status }: { track: Track; status: AccountStatus }) {
  const { t } = useI18n();
  const stages = STAGES[track];
  const idx = status === "SUSPENDED" ? 2 : stages.findIndex((s) => s.status.includes(status));
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label={t("Verification progress")}>
      {stages.map((s, i) => {
        const done = i < idx || (i === idx && (status === "VERIFIED" || i < 2));
        const current = i === idx;
        const rejected = i === 2 && (status === "REJECTED" || status === "SUSPENDED");
        const Icon = rejected ? (status === "SUSPENDED" ? ShieldAlert : CircleX) : i === 2 && status === "VERIFIED" ? CircleCheck : s.icon;
        const label = i === 2 && (status === "VERIFIED" || status === "REJECTED" || status === "SUSPENDED") ? titleCase(status) : s.label;
        return (
          <li key={s.label} aria-current={current ? "step" : undefined}>
            <div className={cn("h-1.5 rounded-full", rejected ? "bg-rose-500" : done || current ? "bg-accent-600" : "bg-slate-200")} />
            <p className={cn("mt-2 flex items-center gap-1.5 text-xs font-semibold", rejected ? "text-rose-600" : current ? "text-slate-900" : done ? "text-slate-700" : "text-slate-400")}>
              <Icon className="h-3.5 w-3.5" aria-hidden /> {t(label)}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

export function StatusTimeline({ events }: { events: StatusEvent[] }) {
  const { t, lang } = useI18n();
  if (!events.length) return <p className="text-sm text-slate-500">{t("No status changes yet.")}</p>;
  return (
    <ol className="relative space-y-5 border-l border-slate-200 pl-6">
      {[...events].reverse().map((e, i) => (
        <li key={`${e.at}-${i}`} className="relative">
          <span className={cn("absolute -left-[31px] grid h-4 w-4 place-items-center rounded-full ring-4 ring-white", i === 0 ? "bg-accent-600" : "bg-slate-300")} aria-hidden />
          <div className="flex flex-wrap items-center gap-2">
            <AccountStatusBadge status={e.status} />
            <span className="text-xs text-slate-500">{formatDateTime(e.at, lang)}</span>
          </div>
          {e.note && <p className="mt-1 text-sm text-slate-600">{t(e.note)}</p>}
        </li>
      ))}
    </ol>
  );
}

const DOC_LABEL: Record<VerificationDocument["type"], string> = {
  NID_FRONT: msg("National ID — front"),
  NID_BACK: msg("National ID — back"),
  PHOTO: msg("Photograph"),
  SELFIE: msg("Selfie / liveness"),
  TRADE_LICENSE: msg("Trade license"),
  BUSINESS_REGISTRATION: msg("Business registration"),
  TAX_CERTIFICATE: msg("TIN / BIN certificate"),
  OWNER_NID: msg("Owner NID"),
  OTHER: msg("Supporting document"),
};

/** English — render with `t()`. */
export function documentLabel(type: VerificationDocument["type"]) {
  return DOC_LABEL[type];
}

export function DocumentList({ documents, actions }: { documents: VerificationDocument[]; actions?: (d: VerificationDocument) => React.ReactNode }) {
  const { t, lang } = useI18n();
  if (!documents.length) return <p className="py-4 text-sm text-slate-500">{t("No documents uploaded.")}</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {documents.map((d) => (
        <li key={d.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
              {d.mimeType.startsWith("image/") ? <ImageIcon className="h-[18px] w-[18px]" aria-hidden /> : <FileText className="h-[18px] w-[18px]" aria-hidden />}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">{t(DOC_LABEL[d.type])}</p>
              <p className="truncate text-xs text-slate-500">
                {d.fileName} · {(d.sizeBytes / 1024).toFixed(0)} KB · {t("uploaded {date}", { date: formatDate(d.uploadedAt, lang) })}
              </p>
              {d.reviewNote && <p className="mt-0.5 text-xs text-rose-600">{t(d.reviewNote)}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 pl-[52px] sm:pl-0">
            <DocumentStatusBadge status={d.status} />
            {actions?.(d)}
          </div>
        </li>
      ))}
    </ul>
  );
}
