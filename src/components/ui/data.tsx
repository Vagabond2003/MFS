"use client";

import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

/* ───────────── Tabs (segmented control) ───────────── */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  tabs: { value: T; label: React.ReactNode; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  ariaLabel: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn("no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1", className)}>
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition",
              active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800",
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={cn("rounded-full px-1.5 text-xs", active ? "bg-accent-100 text-accent-700" : "bg-slate-200 text-slate-600")}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ───────────── Table primitives ───────────── */

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("scroll-thin overflow-x-auto", className)}>
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr className="border-y border-slate-100 bg-slate-50/70 text-xs font-semibold uppercase tracking-wider text-slate-500">{children}</tr>
    </thead>
  );
}

export function TH({ children, className, align = "left" }: { children?: React.ReactNode; className?: string; align?: "left" | "right" | "center" }) {
  return (
    <th scope="col" className={cn("whitespace-nowrap px-4 py-2.5 font-semibold first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6", align === "right" && "text-right", align === "center" && "text-center", className)}>
      {children}
    </th>
  );
}

export function TR({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  return (
    <tr
      onClick={onClick}
      onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick()) : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={cn("border-b border-slate-100 last:border-0", onClick && "cursor-pointer transition hover:bg-slate-50 focus-visible:bg-slate-50", className)}
    >
      {children}
    </tr>
  );
}

export function TD({ children, className, align = "left" }: { children?: React.ReactNode; className?: string; align?: "left" | "right" | "center" }) {
  return (
    <td className={cn("px-4 py-3 align-middle first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6", align === "right" && "text-right", align === "center" && "text-center", className)}>
      {children}
    </td>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onChange: (p: number) => void;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <nav className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-sm sm:px-6" aria-label="Pagination">
      <p className="text-slate-500">
        <span className="tabular font-medium text-slate-700">{from}–{to}</span> of <span className="tabular font-medium text-slate-700">{total.toLocaleString("en-IN")}</span>
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="tabular min-w-16 text-center text-slate-600">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}

/* ───────────── Stat tile ───────────── */

/**
 * label (sentence case) · value · optional delta vs a named period.
 * Delta colour = direction × whether "up" is good for this metric.
 */
export function StatTile({
  label,
  value,
  icon,
  delta,
  deltaLabel = "vs last month",
  upIsGood = true,
  hint,
  className,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  delta?: number | null;
  deltaLabel?: string;
  upIsGood?: boolean;
  hint?: React.ReactNode;
  className?: string;
  tone?: "default" | "dark";
}) {
  const hasDelta = delta !== undefined && delta !== null && Number.isFinite(delta);
  const up = hasDelta && delta! >= 0;
  const good = hasDelta && (up === upIsGood);
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 sm:p-5",
        tone === "dark" ? "border-white/10 bg-white/5 text-white" : "border-slate-200/80 bg-white shadow-card",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className={cn("text-[13px] font-medium", tone === "dark" ? "text-slate-300" : "text-slate-500")}>{label}</p>
        {icon && (
          <span className={cn("grid h-8 w-8 place-items-center rounded-lg", tone === "dark" ? "bg-white/10 text-accent-500" : "bg-accent-50 text-accent-700")}>
            {icon}
          </span>
        )}
      </div>
      <div className={cn("mt-2 text-xl font-bold tracking-tight sm:text-2xl", tone === "dark" ? "text-white" : "text-slate-900")}>{value}</div>
      {(hasDelta || hint) && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs">
          {hasDelta && (
            <span className={cn("inline-flex items-center gap-0.5 font-semibold", good ? "text-emerald-700" : "text-rose-600", tone === "dark" && (good ? "text-emerald-400" : "text-rose-400"))}>
              {up ? <TrendingUp className="h-3.5 w-3.5" aria-hidden /> : <TrendingDown className="h-3.5 w-3.5" aria-hidden />}
              {up ? "+" : "−"}
              {Math.abs(delta!).toFixed(0)}%
            </span>
          )}
          {hasDelta && <span className={tone === "dark" ? "text-slate-400" : "text-slate-400"}>{deltaLabel}</span>}
          {!hasDelta && hint && <span className={tone === "dark" ? "text-slate-400" : "text-slate-500"}>{hint}</span>}
        </div>
      )}
    </div>
  );
}

/* ───────────── Key/value list ───────────── */

export function DescriptionList({ items, className }: { items: { label: string; value: React.ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-slate-100", className)}>
      {items.map((it) => (
        <div key={it.label} className="flex items-start justify-between gap-4 py-2.5 text-sm">
          <dt className="shrink-0 text-slate-500">{it.label}</dt>
          <dd className="min-w-0 text-right font-medium break-words text-slate-900">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ───────────── Stepper ───────────── */

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Progress">
      {steps.map((s, i) => {
        const state = i < current ? "done" : i === current ? "current" : "todo";
        return (
          <li key={s} className="flex min-w-0 flex-1 items-center gap-2" aria-current={state === "current" ? "step" : undefined}>
            <span
              className={cn(
                "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold transition",
                state === "done" && "bg-accent-600 text-accent-fg",
                state === "current" && "bg-accent-100 text-accent-700 ring-2 ring-accent-500",
                state === "todo" && "bg-slate-100 text-slate-400",
              )}
            >
              {i + 1}
            </span>
            <span className={cn("hidden truncate text-xs font-medium md:block", state === "todo" ? "text-slate-400" : "text-slate-700")}>{s}</span>
            {i < steps.length - 1 && <span className={cn("h-0.5 min-w-3 flex-1 rounded-full", i < current ? "bg-accent-500" : "bg-slate-200")} />}
          </li>
        );
      })}
    </ol>
  );
}
