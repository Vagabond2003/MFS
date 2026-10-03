"use client";

import { CalendarClock, CalendarDays, Clock3, HeartHandshake, Lightbulb, QrCode, Repeat2, ShieldAlert, TrendingDown, TrendingUp, Users } from "lucide-react";
import { ChartCard, ColumnChart, ForecastChart, forecastRows, LegendKey, SERIES_COLORS } from "@/components/charts/charts";
import { PAYMENT_METHOD_LABEL } from "@/components/transactions/meta";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useApi } from "@/hooks/use-api";
import { useI18n } from "@/hooks/use-i18n";
import { msg } from "@/lib/i18n/core";
import { cn, formatMoney } from "@/lib/utils";
import { api } from "@/services";
import type { BenchmarkMetric, MerchantBenchmarkView, MerchantSignalCode } from "@/types/domain";
import { CATEGORY_META } from "../register/merchant-form";
import { AiSource, AiTextBlock } from "./ai-note";
import { useInsightLang } from "./agent";

const DAY_NAMES = [msg("Sunday"), msg("Monday"), msg("Tuesday"), msg("Wednesday"), msg("Thursday"), msg("Friday"), msg("Saturday")];

const TOPIC_ICON: Record<MerchantSignalCode, typeof Lightbulb> = {
  WIN_BACK: HeartHandshake,
  REDUCE_FAILURES: ShieldAlert,
  MONTH_START: CalendarClock,
  BUSY_DAY_AHEAD: CalendarDays,
  PROMOTE_QR: QrCode,
  BUILD_LOYALTY: Repeat2,
  PEAK_HOURS: Clock3,
};

const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

export function MerchantInsightsView() {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t("Insights")} title={t("Business insights")} description={t("Forecasts and comparisons from your own payments. Other merchants appear only as anonymous medians.")} />
      <Recommendations />
      <DemandSection />
      <BenchmarkSection />
    </div>
  );
}

/* ───────────── Recommendations ───────────── */

function Recommendations() {
  const { t } = useI18n();
  const aiLang = useInsightLang();
  const q = useApi(() => api.insights.recommendations(), [aiLang], { tags: ["transactions"] });
  const r = q.data;
  return (
    <Card>
      <CardHeader icon={<Lightbulb className="h-4 w-4" />} title={t("What to do this week")} description={t("Chosen from your forecast, peer comparison and recent payments.")} />
      <CardBody>
        {q.error && !r ? (
          <ErrorState className="py-4" message={q.error.message} onRetry={q.reload} />
        ) : !r ? (
          <div className="grid gap-3 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : !r.ai.items.length ? (
          <EmptyState className="py-6" icon={<Lightbulb className="h-6 w-6" />} title={t("Not enough payment history yet")} description={t("Recommendations appear once customers have paid you for a couple of weeks.")} />
        ) : (
          <>
            <ol className="grid gap-3 md:grid-cols-3">
              {r.ai.items.map((item, i) => {
                const Icon = TOPIC_ICON[r.topics[i]] ?? Lightbulb;
                return (
                  <li key={`${r.topics[i]}-${i}`} className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-100 text-accent-700">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <h3 className="mt-3 text-sm font-bold text-slate-900">{item.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">{item.detail}</p>
                  </li>
                );
              })}
            </ol>
            <AiSource meta={r.ai} className="mt-3" />
          </>
        )}
      </CardBody>
    </Card>
  );
}

/* ───────────── Demand forecast ───────────── */

function DemandSection() {
  const { t } = useI18n();
  const aiLang = useInsightLang();
  const q = useApi(() => api.insights.demandForecast(), [aiLang], { tags: ["transactions"] });
  const d = q.data;
  if (q.error && !d) return <ErrorState message={q.error.message} onRetry={q.reload} />;
  if (!d) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  const rows = forecastRows(
    d.actual.map((a) => ({ label: a.label, value: a.revenue })),
    d.revenueForecast.points,
  );
  const labels = { actual: t("Actual sales"), forecast: t("Forecast"), range: t("Likely range") };
  const trend = d.revenueForecast.trendPerWeekPct;
  const uplift = d.revenueForecast.monthStartUplift;
  // Busiest hours are picked by number of payments, so the chart shows payments too (30-day totals).
  const hours = d.hours.map((h) => ({ hour: hourLabel(h.hour), payments: Math.round(h.count * 30) }));

  return (
    <section aria-label={t("Sales forecast")} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ChartCard
          title={t("Sales: last 28 days and next 7")}
          description={t("Daily sales. The dashed line is the forecast; the shaded band is the likely range.")}
          xKey="label"
          data={rows.map((r) => ({ label: r.label, actual: r.actual ?? 0, forecast: r.actual === undefined ? (r.forecast ?? 0) : 0, low: r.actual === undefined ? (r.band?.[0] ?? 0) : 0, high: r.actual === undefined ? (r.band?.[1] ?? 0) : 0 }))}
          series={[
            { key: "actual", label: labels.actual },
            { key: "forecast", label: labels.forecast },
            { key: "low", label: t("Likely low") },
            { key: "high", label: t("Likely high") },
          ]}
          refreshing={q.refreshing}
          legend={
            <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label={t("Legend")}>
              <LegendKey color={SERIES_COLORS[0]} label={labels.actual} />
              <LegendKey color={SERIES_COLORS[0]} label={labels.forecast} shape="dashed" />
              <LegendKey color={SERIES_COLORS[0]} label={labels.range} shape="band" />
            </ul>
          }
        >
          <ForecastChart rows={rows} labels={labels} />
        </ChartCard>

        <Card className="flex flex-col">
          <CardHeader title={t("Next 7 days")} />
          <CardBody className="flex flex-1 flex-col gap-4">
            <div>
              <p className="tabular text-3xl font-bold tracking-tight text-slate-900">{formatMoney(d.nextWeek.value, { whole: true })}</p>
              <p className="tabular mt-1 text-sm text-slate-500">
                {t("Likely {low} – {high}", { low: formatMoney(d.nextWeek.low, { whole: true }), high: formatMoney(d.nextWeek.high, { whole: true }) })}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">{t("Busiest day")}</dt>
                <dd className="mt-0.5 font-semibold text-slate-900">{d.busiestWeekday === null ? "—" : t(DAY_NAMES[d.busiestWeekday])}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">{t("Weekly trend")}</dt>
                <dd className={cn("tabular mt-0.5 flex items-center gap-1 font-semibold", trend >= 0 ? "text-emerald-700" : "text-rose-600")}>
                  {trend >= 0 ? <TrendingUp className="h-3.5 w-3.5" aria-hidden /> : <TrendingDown className="h-3.5 w-3.5" aria-hidden />}
                  {trend >= 0 ? "+" : "−"}
                  {Math.abs(trend).toFixed(1)}%
                </dd>
              </div>
              {uplift !== null && uplift > 1.05 && (
                <div className="col-span-2 rounded-xl bg-slate-50 p-3">
                  <dt className="text-xs text-slate-500">{t("Salary days (1st–5th)")}</dt>
                  <dd className="tabular mt-0.5 font-semibold text-slate-900">{t("{pct}% higher sales", { pct: Math.round((uplift - 1) * 100) })}</dd>
                </div>
              )}
            </dl>
            <AiTextBlock note={d.ai} className="mt-auto border-t border-slate-100 pt-4" />
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ChartCard
          title={t("Busiest hours")}
          description={d.busiestHours.length ? t("Payments by hour of day, last 30 days · busiest: {hours}", { hours: [...d.busiestHours].sort((a, b) => a - b).map(hourLabel).join(", ") }) : t("Payments by hour of day, last 30 days")}
          xKey="hour"
          data={hours}
          series={[{ key: "payments", label: t("Payments") }]}
          format="count"
          refreshing={q.refreshing}
        >
          <ColumnChart data={hours} xKey="hour" series={[{ key: "payments", label: t("Payments") }]} format="count" />
        </ChartCard>
        <Card>
          <CardHeader title={t("Who pays and how")} description={t("Share of sales, last 30 days")} />
          <CardBody className="space-y-3">
            {[
              ...d.breakdown.method.map((m) => ({ key: m.method, label: t(PAYMENT_METHOD_LABEL[m.method]), share: m.share })),
              { key: "repeat", label: t("Repeat customers"), share: d.breakdown.repeatShare },
              { key: "new", label: t("New customers"), share: d.breakdown.newShare },
            ].map((row, i, all) => (
              <div key={row.key} className={cn(i === all.length - 2 && "border-t border-slate-100 pt-3")}>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">{row.label}</span>
                  <span className="tabular font-semibold text-slate-900">{Math.round(row.share * 100)}%</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-accent-500" style={{ width: `${Math.round(row.share * 100)}%` }} />
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </section>
  );
}

/* ───────────── Benchmark ───────────── */

const METRIC: Record<BenchmarkMetric, { label: string; money: boolean }> = {
  revenue: { label: msg("Sales (30 days)"), money: true },
  avgTicket: { label: msg("Average payment"), money: true },
  repeatRate: { label: msg("Repeat customers"), money: false },
  qrShare: { label: msg("Paid by QR"), money: false },
  failureRate: { label: msg("Failed payments"), money: false },
};

function scopeText(b: MerchantBenchmarkView, t: ReturnType<typeof useI18n>["t"]) {
  const category = t(CATEGORY_META[b.category].label);
  if (b.scope === "CATEGORY_DISTRICT") return t("Compared with {n} {category} merchants in {district}", { n: b.peerCount, category, district: t(b.district ?? "") });
  if (b.scope === "CATEGORY") return t("Compared with {n} {category} merchants across Kosh", { n: b.peerCount, category });
  return t("Compared with {n} merchants across Kosh", { n: b.peerCount });
}

function BenchmarkSection() {
  const { t } = useI18n();
  const aiLang = useInsightLang();
  const q = useApi(() => api.insights.benchmark(), [aiLang], { tags: ["transactions"] });
  const b = q.data;
  if (q.error && !b) return <ErrorState message={q.error.message} onRetry={q.reload} />;

  return (
    <Card>
      <CardHeader icon={<Users className="h-4 w-4" />} title={t("How you compare")} description={b && b.peerCount >= 3 ? scopeText(b, t) : t("Similar merchants, last 30 days")} />
      <CardBody>
        {!b ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : b.peerCount < 3 ? (
          <EmptyState className="py-6" icon={<Users className="h-6 w-6" />} title={t("Not enough similar merchants yet")} description={t("Comparisons appear once at least 3 similar merchants are active.")} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <ul className="space-y-5">
              {b.metrics.map((m) => {
                const meta = METRIC[m.key];
                const show = (v: number) => (meta.money ? formatMoney(v, { whole: true }) : `${Math.round(v * 100)}%`);
                const max = Math.max(m.value, m.peerMedian) || 1;
                const better = m.percentile >= 50;
                return (
                  <li key={m.key}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-semibold text-slate-900">{t(meta.label)}</span>
                      <span className={cn("text-xs font-semibold", better ? "text-emerald-700" : "text-amber-700")}>
                        {t("Ahead of {pct}% of peers", { pct: m.percentile })}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {[
                        { label: t("You"), value: m.value, color: SERIES_COLORS[0] },
                        { label: t("Typical"), value: m.peerMedian, color: "#94a3b8" },
                      ].map((bar) => (
                        <div key={bar.label} className="flex items-center gap-3 text-xs">
                          <span className="w-14 shrink-0 text-slate-500">{bar.label}</span>
                          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full" style={{ width: `${Math.max(2, (bar.value / max) * 100)}%`, background: bar.color }} />
                          </div>
                          <span className="tabular w-20 shrink-0 text-right font-semibold text-slate-900">{show(bar.value)}</span>
                        </div>
                      ))}
                    </div>
                    {!m.higherIsBetter && <p className="mt-1 text-xs text-slate-400">{t("Lower is better")}</p>}
                  </li>
                );
              })}
            </ul>
            <div className="rounded-xl bg-slate-50 p-4">
              <AiTextBlock note={b.ai} />
              <p className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500">
                {t("“Typical” is the median of similar merchants. No other merchant's name or figures are shown.")}
              </p>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
