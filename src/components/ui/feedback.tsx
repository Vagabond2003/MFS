"use client";

import { CircleAlert, CircleCheck, Info, LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "./button";

export function Spinner({ className, label }: { className?: string; label?: string }) {
  const { t } = useI18n();
  return (
    <span role="status" aria-label={label ?? t("Loading")} className="inline-flex">
      <LoaderCircle className={cn("h-5 w-5 animate-spin text-accent-600", className)} aria-hidden />
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-slate-200/70", className)} aria-hidden />;
}

export function PageLoader({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-sm text-slate-500" role="status">
      <LoaderCircle className="h-7 w-7 animate-spin text-accent-600" aria-hidden />
      {label ?? t("Loading…")}
    </div>
  );
}

export function FullScreenLoader({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas" role="status">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 text-lg font-extrabold text-white shadow-lg">K</div>
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
        {label ?? t("Loading…")}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {icon && <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">{icon}</div>}
      <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title,
  message,
  onRetry,
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)} role="alert">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-500">
        <CircleAlert className="h-6 w-6" aria-hidden />
      </div>
      <h3 className="text-[15px] font-semibold text-slate-900">{title ?? t("Something went wrong")}</h3>
      {message && <p className="mt-1 max-w-sm text-sm text-slate-500">{message}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-5" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" aria-hidden /> {t("Try again")}
        </Button>
      )}
    </div>
  );
}

type AlertTone = "info" | "warning" | "danger" | "success";

const alertTones: Record<AlertTone, { box: string; icon: React.ReactNode }> = {
  info: { box: "border-sky-200 bg-sky-50 text-sky-900", icon: <Info className="h-5 w-5 text-sky-600" aria-hidden /> },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-900", icon: <TriangleAlert className="h-5 w-5 text-amber-600" aria-hidden /> },
  danger: { box: "border-rose-200 bg-rose-50 text-rose-900", icon: <CircleAlert className="h-5 w-5 text-rose-600" aria-hidden /> },
  success: { box: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: <CircleCheck className="h-5 w-5 text-emerald-600" aria-hidden /> },
};

export function Alert({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: AlertTone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const style = alertTones[tone];
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center", style.box, className)} role={tone === "danger" ? "alert" : "status"}>
      <div className="flex flex-1 items-start gap-3">
        <span className="mt-0.5 shrink-0">{style.icon}</span>
        <div className="text-sm">
          {title && <div className="font-semibold">{title}</div>}
          {children && <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div>}
        </div>
      </div>
      {action && <div className="shrink-0 pl-8 sm:pl-0">{action}</div>}
    </div>
  );
}
