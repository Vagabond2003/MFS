"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Table2 } from "lucide-react";
import { cn, formatCount, formatMoney, formatMoneyCompact } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/hooks/use-i18n";
import { localizeMonths } from "@/lib/i18n/core";

/**
 * Chart system
 * - Categorical palette (validated for CVD separation, fixed order — never cycled):
 *   blue, orange, aqua, yellow. Slots 3–4 sit below 3:1 contrast on white, so every
 *   chart ships a legend, a hover tooltip and a "table" view (relief rule).
 * - Thin marks: bars ≤24px with 4px rounded data-ends; 2px lines; 10% area wash.
 * - Hairline solid gridlines; text never wears a series colour.
 * - One y-axis per chart, always.
 */
export const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"] as const;

const INK_MUTED = "#64748b";
const GRID = "#e8ecf1";
const AXIS = "#cbd5e1";

export type ValueFormat = "money" | "count";

const fmtFull = (v: number, f: ValueFormat) => (f === "money" ? formatMoney(v) : formatCount(v));
const fmtAxis = (v: number, f: ValueFormat) => (f === "money" ? formatMoneyCompact(v) : formatCount(v));

export interface Series {
  key: string;
  label: string;
}

type Row = Record<string, string | number>;

/* ───────────── Tooltip: value leads, label follows, line keys ───────────── */

interface TooltipLikeProps {
  active?: boolean;
  label?: unknown;
  payload?: ReadonlyArray<{ dataKey?: unknown; value?: unknown; color?: string; payload?: unknown }>;
}

function SeriesTooltip({ active, payload, label, series, format }: TooltipLikeProps & { series: Series[]; format: ValueFormat }) {
  const { lang } = useI18n();
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-40 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-float">
      <p className="mb-1.5 text-xs font-medium text-slate-500">{localizeMonths(lang, String(label ?? ""))}</p>
      <ul className="space-y-1">
        {series.map((s, i) => {
          const p = payload.find((x) => x.dataKey === s.key);
          if (!p) return null;
          return (
            <li key={s.key} className="flex items-center gap-2">
              <span className="h-0.5 w-3 rounded-full" style={{ background: SERIES_COLORS[i] }} aria-hidden />
              <span className="tabular font-semibold text-slate-900">{fmtFull(Number(p.value ?? 0), format)}</span>
              <span className="text-xs text-slate-500">{s.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ───────────── Card wrapper with legend + table view ───────────── */

export function ChartCard({
  title,
  description,
  series,
  data,
  xKey,
  format = "money",
  legendShape = "rect",
  children,
  className,
  refreshing,
  action,
}: {
  title: string;
  description?: string;
  series: Series[];
  data: Row[];
  xKey: string;
  format?: ValueFormat;
  legendShape?: "rect" | "line";
  children: React.ReactNode;
  className?: string;
  refreshing?: boolean;
  action?: React.ReactNode;
}) {
  const { t, lang } = useI18n();
  const [showTable, setShowTable] = useState(false);
  return (
    <Card className={cn("flex flex-col", className)}>
      <div className="flex items-start justify-between gap-3 px-5 pt-5 sm:px-6">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
          {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {action}
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            aria-pressed={showTable}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition",
              showTable ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
            )}
          >
            <Table2 className="h-3.5 w-3.5" aria-hidden />
            {t("Table")}
          </button>
        </div>
      </div>
      {series.length >= 2 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 px-5 pt-3 sm:px-6" aria-label={t("Legend")}>
          {series.map((s, i) => (
            <li key={s.key} className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <span
                className={legendShape === "line" ? "h-0.5 w-3.5 rounded-full" : "h-2.5 w-2.5 rounded-[3px]"}
                style={{ background: SERIES_COLORS[i] }}
                aria-hidden
              />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <div className={cn("flex-1 px-2 pb-4 pt-2 transition-opacity sm:px-3", refreshing && "opacity-60")}>
        {showTable ? (
          <div className="scroll-thin max-h-72 overflow-auto px-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="py-2 font-semibold">{t("Period")}</th>
                  {series.map((s) => (
                    <th key={s.key} className="py-2 text-right font-semibold">
                      {s.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={String(row[xKey])} className="border-b border-slate-50">
                    <td className="py-1.5 text-slate-600">{localizeMonths(lang, String(row[xKey]))}</td>
                    {series.map((s) => (
                      <td key={s.key} className="tabular py-1.5 text-right font-medium text-slate-900">
                        {fmtFull(Number(row[s.key] ?? 0), format)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>
    </Card>
  );
}

/* ───────────── Grouped columns ───────────── */

export function ColumnChart({
  data,
  xKey,
  series,
  format = "money",
  height = 260,
}: {
  data: Row[];
  xKey: string;
  series: Series[];
  format?: ValueFormat;
  height?: number;
}) {
  const { lang } = useI18n();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }} barGap={2} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey={xKey} tickLine={false} axisLine={{ stroke: AXIS }} tick={{ fontSize: 12, fill: INK_MUTED }} interval="preserveStartEnd" minTickGap={8} tickFormatter={(v) => localizeMonths(lang, String(v))} />
        <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: INK_MUTED }} tickFormatter={(v: number) => fmtAxis(v, format)} width={60} />
        <Tooltip
          cursor={{ fill: "rgba(15, 23, 42, 0.04)" }}
          content={(p) => <SeriesTooltip {...(p as TooltipLikeProps)} series={series} format={format} />}
        />
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={SERIES_COLORS[i]} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ───────────── Lines with a soft area wash ───────────── */

export function TrendChart({
  data,
  xKey,
  series,
  format = "money",
  height = 260,
}: {
  data: Row[];
  xKey: string;
  series: Series[];
  format?: ValueFormat;
  height?: number;
}) {
  const { lang } = useI18n();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey={xKey} tickLine={false} axisLine={{ stroke: AXIS }} tick={{ fontSize: 12, fill: INK_MUTED }} interval="preserveStartEnd" minTickGap={12} tickFormatter={(v) => localizeMonths(lang, String(v))} />
        <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: INK_MUTED }} tickFormatter={(v: number) => fmtAxis(v, format)} width={60} />
        <Tooltip
          cursor={{ stroke: "#94a3b8", strokeWidth: 1 }}
          content={(p) => <SeriesTooltip {...(p as TooltipLikeProps)} series={series} format={format} />}
        />
        {series.map((s, i) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={SERIES_COLORS[i]}
            strokeWidth={2}
            fill={SERIES_COLORS[i]}
            fillOpacity={0.1}
            dot={false}
            activeDot={{ r: 4.5, strokeWidth: 2, stroke: "#fff" }}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ───────────── Donut with a direct-labelled legend ───────────── */

export function DonutCard({
  title,
  description,
  data,
  format = "money",
  centerLabel,
  emptyText,
}: {
  title: string;
  description?: string;
  data: { label: string; value: number; sub?: string }[];
  format?: ValueFormat;
  centerLabel?: string;
  emptyText?: string;
}) {
  const { t } = useI18n();
  // Max 4 slices: anything beyond folds into "Other" (no generated hues).
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const slices = sorted.length > 4 ? [...sorted.slice(0, 3), { label: t("Other"), value: sorted.slice(3).reduce((s, d) => s + d.value, 0) }] : sorted;
  const total = slices.reduce((s, d) => s + d.value, 0);

  return (
    <Card className="@container flex flex-col">
      <div className="px-5 pt-5 sm:px-6">
        <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
      {total === 0 ? (
        <p className="flex flex-1 items-center justify-center px-6 py-12 text-sm text-slate-500">{emptyText ?? t("No data for this period")}</p>
      ) : (
        <div className="flex flex-1 flex-col items-center gap-5 px-5 pb-5 pt-3 @lg:flex-row sm:px-6">
          <div className="relative h-44 w-44 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices} dataKey="value" nameKey="label" innerRadius="64%" outerRadius="100%" paddingAngle={1.5} stroke="#fff" strokeWidth={2} isAnimationActive={false}>
                  {slices.map((s, i) => (
                    <Cell key={s.label} fill={SERIES_COLORS[i]} />
                  ))}
                </Pie>
                <Tooltip
                  content={(p) => {
                    const tip = p as TooltipLikeProps;
                    const item = tip.payload?.[0];
                    if (!tip.active || !item) return null;
                    const row = item.payload as { label: string; value: number };
                    return (
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-float">
                        <span className="tabular font-semibold text-slate-900">{fmtFull(row.value, format)}</span>{" "}
                        <span className="text-xs text-slate-500">{t(row.label)}</span>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-base font-bold text-slate-900">{format === "money" ? formatMoneyCompact(total) : formatCount(total)}</span>
              {centerLabel && <span className="text-[11px] text-slate-500">{centerLabel}</span>}
            </div>
          </div>
          <ul className="w-full flex-1 space-y-2.5">
            {slices.map((s, i) => (
              <li key={s.label} className="flex items-center gap-2.5 text-sm">
                <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: SERIES_COLORS[i] }} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-slate-600">{t(s.label)}</span>
                <span className="tabular font-semibold text-slate-900">{fmtFull(s.value, format)}</span>
                <span className="tabular w-11 text-right text-xs text-slate-500">{((s.value / total) * 100).toFixed(0)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
