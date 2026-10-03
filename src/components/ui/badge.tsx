"use client";

import {
  CircleAlert,
  CircleCheck,
  CircleSlash,
  CircleX,
  Clock3,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Search,
  Send,
} from "lucide-react";
import { cn, titleCase } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import { msg } from "@/lib/i18n/core";
import type { AccountStatus, DisputeStatus, DocumentStatus, TransactionStatus } from "@/types/domain";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent" | "violet";

const tones: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  danger: "bg-rose-50 text-rose-700 ring-rose-200",
  info: "bg-sky-50 text-sky-700 ring-sky-200",
  accent: "bg-accent-50 text-accent-700 ring-accent-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
};

export function Badge({
  tone = "neutral",
  children,
  icon,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

const ic = "h-3.5 w-3.5";

/** Status always pairs colour with an icon and a label — never colour alone. */
const TXN: Record<TransactionStatus, { tone: Tone; label: string; icon: React.ReactNode }> = {
  SUCCESSFUL: { tone: "success", label: msg("Successful"), icon: <CircleCheck className={ic} aria-hidden /> },
  PENDING: { tone: "warning", label: msg("Pending"), icon: <Clock3 className={ic} aria-hidden /> },
  FAILED: { tone: "danger", label: msg("Failed"), icon: <CircleX className={ic} aria-hidden /> },
  CANCELLED: { tone: "neutral", label: msg("Cancelled"), icon: <CircleSlash className={ic} aria-hidden /> },
  REFUNDED: { tone: "violet", label: msg("Refunded"), icon: <RotateCcw className={ic} aria-hidden /> },
};

export function TxnStatusBadge({ status }: { status: TransactionStatus }) {
  const { t } = useI18n();
  const s = TXN[status];
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {t(s.label)}
    </Badge>
  );
}

const ACCOUNT: Record<AccountStatus, { tone: Tone; label: string; icon: React.ReactNode }> = {
  VERIFIED: { tone: "success", label: msg("Verified"), icon: <ShieldCheck className={ic} aria-hidden /> },
  ACTIVE: { tone: "success", label: msg("Active"), icon: <CircleCheck className={ic} aria-hidden /> },
  PENDING_VERIFICATION: { tone: "warning", label: msg("Pending verification"), icon: <Clock3 className={ic} aria-hidden /> },
  PENDING: { tone: "warning", label: msg("Pending"), icon: <Clock3 className={ic} aria-hidden /> },
  APPLICATION_SUBMITTED: { tone: "info", label: msg("Application submitted"), icon: <Send className={ic} aria-hidden /> },
  UNDER_REVIEW: { tone: "info", label: msg("Under review"), icon: <Search className={ic} aria-hidden /> },
  REJECTED: { tone: "danger", label: msg("Rejected"), icon: <CircleX className={ic} aria-hidden /> },
  SUSPENDED: { tone: "danger", label: msg("Suspended"), icon: <ShieldAlert className={ic} aria-hidden /> },
};

export function AccountStatusBadge({ status }: { status: AccountStatus }) {
  const { t } = useI18n();
  const s = ACCOUNT[status];
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {t(s.label)}
    </Badge>
  );
}

/** English label — render it with `t()`. */
export function accountStatusLabel(status: AccountStatus) {
  return ACCOUNT[status]?.label ?? titleCase(status);
}

const DOC: Record<DocumentStatus, { tone: Tone; label: string; icon: React.ReactNode }> = {
  APPROVED: { tone: "success", label: msg("Approved"), icon: <CircleCheck className={ic} aria-hidden /> },
  PENDING: { tone: "warning", label: msg("Pending review"), icon: <Clock3 className={ic} aria-hidden /> },
  REJECTED: { tone: "danger", label: msg("Rejected"), icon: <CircleX className={ic} aria-hidden /> },
};

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  const { t } = useI18n();
  const s = DOC[status];
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {t(s.label)}
    </Badge>
  );
}

const DISPUTE: Record<DisputeStatus, { tone: Tone; label: string; icon: React.ReactNode }> = {
  OPEN: { tone: "warning", label: msg("Open"), icon: <CircleAlert className={ic} aria-hidden /> },
  INVESTIGATING: { tone: "info", label: msg("Investigating"), icon: <Search className={ic} aria-hidden /> },
  RESOLVED: { tone: "success", label: msg("Resolved"), icon: <CircleCheck className={ic} aria-hidden /> },
  REJECTED: { tone: "neutral", label: msg("Rejected"), icon: <CircleX className={ic} aria-hidden /> },
};

export function DisputeStatusBadge({ status }: { status: DisputeStatus }) {
  const { t } = useI18n();
  const s = DISPUTE[status];
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {t(s.label)}
    </Badge>
  );
}

export function DemoBadge({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <span className={cn("rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800", className)}>
      {t("Demo")}
    </span>
  );
}
