"use client";

import Link from "next/link";
import { ArrowDownToLine, ArrowRight, Banknote, CircleCheck, Gauge, Landmark, Medal, Percent, TrendingUp, TriangleAlert, Wallet } from "lucide-react";
import { ChartCard, ColumnChart, LegendKey, ProjectionChart, SERIES_COLORS, type ProjectionRow } from "@/components/charts/charts";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader, SectionTitle } from "@/components/ui/card";
import { StatTile, Table, TD, TH, THead, TR } from "@/components/ui/data";
import { Alert, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useApi } from "@/hooks/use-api";
import { useCurrentUser } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { localizeMonths, msg } from "@/lib/i18n/core";
import { cn, formatCount, formatMoney } from "@/lib/utils";
import { api } from "@/services";
import type { AgentLiquidity, LiquiditySuggestion } from "@/types/domain";
import { AiTextBlock } from "./ai-note";

/** Insight wording follows the saved language: refetch once a language switch is saved. */
export function useInsightLang() {
  const { lang } = useI18n();
  const user = useCurrentUser();
  return user.language ?? lang;
}

const SUGGESTION: Record<LiquiditySuggestion["kind"], { label: string; hint: string; icon: typeof Wallet; href?: string }> = {
  FLOAT_TOP_UP: { label: msg("Top up e-money float"), hint: msg("Deposit outlet cash at the bank: Settlement → Cash → e-money float."), icon: Wallet, href: "/dashboard/agent/settlement" },
  ADD_CASH: { label: msg("Bring more cash to the counter"), hint: msg("Withdraw from your bank or distributor before the busy day."), icon: Banknote },
  SETTLE_TO_BANK: { label: msg("Settle surplus e-money to bank"), hint: msg("More e-money than the coming week needs: Settlement → E-money → bank."), icon: Landmark, href: "/dashboard/agent/settlement" },
};

function labelOf(l: AgentLiquidity, date: string) {
  return l.days.find((d) => d.date === date)?.label ?? date;
}

function ShortfallAlert({ l, compact }: { l: AgentLiquidity; compact?: boolean }) {
  const { t, lang } = useI18n();
  if (!l.shortfall) {
    return (
      <Alert tone="success" title={t("Cash and float look sufficient for the next 7 days")}>
        {!compact && t("Even a busy day stays within your projected cash and e-money float.")}
      </Alert>
    );
  }
  const s = l.shortfall;
  return (
    <Alert tone="danger" title={s.kind === "CASH" ? t("Cash may run short on {date}", { date: localizeMonths(lang, s.label) }) : t("E-money float may run short on {date}", { date: localizeMonths(lang, s.label) })}>
      {t("You'd start the day with {opening}; a busy day could need {demand}.", { opening: formatMoney(s.opening, { whole: true }), demand: formatMoney(s.demand, { whole: true }) })}
    </Alert>
  );
}

function SuggestionList({ l }: { l: AgentLiquidity }) {
  const { t, lang } = useI18n();
  if (!l.suggestions.length) return <p className="text-sm text-slate-500">{t("No action needed this week.")}</p>;
  return (
    <ul className="space-y-2">
      {l.suggestions.map((s) => {
        const meta = SUGGESTION[s.kind];
        const Icon = meta.icon;
        const body = (
          <>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-50 text-accent-700">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-semibold text-slate-900">{t(meta.label)}</span>
                <span className="tabular text-sm font-bold text-accent-700">{formatMoney(s.amount, { whole: true })}</span>
                <span className="text-xs text-slate-500">{t("before {date}", { date: localizeMonths(lang, labelOf(l, s.byDate)) })}</span>
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">{t(meta.hint)}</span>
            </span>
            {meta.href && <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />}
          </>
        );
        return (
          <li key={s.kind}>
            {meta.href ? (
              <Link href={meta.href} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-accent-500">
                {body}
              </Link>
            ) : (
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ───────────── Dashboard card ───────────── */

export function LiquidityCard() {
  const { t } = useI18n();
  const aiLang = useInsightLang();
  const q = useApi(() => api.insights.liquidityForecast(), [aiLang], { tags: ["wallet"] });
  const l = q.data;
  return (
    <Card>
      <CardHeader
        icon={<Gauge className="h-4 w-4" />}
        title={t("Cash & float — next 7 days")}
        description={t("Forecast from your own transaction history")}
        action={
          <ButtonLink href="/dashboard/agent/liquidity" variant="ghost" size="sm">
            {t("Open planner")} <ArrowRight className="h-4 w-4" aria-hidden />
          </ButtonLink>
        }
      />
      <CardBody className="space-y-4">
        {q.error && !l ? (
          <ErrorState className="py-4" message={q.error.message} onRetry={q.reload} />
        ) : !l ? (
          <>
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-4 w-3/4" />
          </>
        ) : (
          <>
            <ShortfallAlert l={l} compact />
            {l.suggestions.length > 0 && <SuggestionList l={{ ...l, suggestions: l.suggestions.slice(0, 1) }} />}
            <AiTextBlock note={l.ai} />
          </>
        )}
      </CardBody>
    </Card>
  );
}

/* ───────────── Liquidity planner page ───────────── */

export function AgentLiquidityView() {
  const { t, lang } = useI18n();
  const aiLang = useInsightLang();
  const q = useApi(() => api.insights.liquidityForecast(), [aiLang], { tags: ["wallet"] });
  const l = q.data;
  if (q.error && !l) return <ErrorState message={q.error.message} onRetry={q.reload} />;

  const week = l?.days.slice(1) ?? [];
  const rows: ProjectionRow[] = l
    ? [
        ...l.history.map((h) => ({ label: h.label, cash: h.cash, float: h.float })),
        ...l.days.map((d) => ({ label: d.label, cashProj: d.closingCash, floatProj: d.closingFloat, cashRisk: d.cashAtRisk, floatRisk: d.floatAtRisk })),
      ]
    : [];
  // The projection starts where history ends, so the dashed lines continue the solid ones.
  if (l?.history.length) Object.assign(rows[l.history.length - 1], { cashProj: rows[l.history.length - 1].cash, floatProj: rows[l.history.length - 1].float });
  const uplift = l?.cashOutForecast.monthStartUplift;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t("Insights")} title={t("Liquidity planner")} description={t("How much cash and e-money float you'll need over the next 7 days, forecast from your own history.")} />

      {!l ? (
        <div className="space-y-6">
          <Skeleton className="h-28 rounded-2xl" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader icon={<Gauge className="h-4 w-4" />} title={t("This week")} />
              <CardBody className="space-y-4">
                <ShortfallAlert l={l} />
                <AiTextBlock note={l.ai} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title={t("Suggested actions")} description={t("Amounts are rounded up to the next ৳1,000.")} />
              <CardBody>
                <SuggestionList l={l} />
              </CardBody>
            </Card>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label={t("Cash in hand")} value={formatMoney(l.cashInHand)} icon={<Banknote className="h-4 w-4" />} />
            <StatTile label={t("E-money float")} value={formatMoney(l.float)} icon={<Wallet className="h-4 w-4" />} />
            <StatTile label={t("Expected cash out")} value={formatMoney(week.reduce((s, d) => s + d.cashOut, 0), { whole: true })} icon={<Banknote className="h-4 w-4" />} hint={t("Next 7 days")} />
            <StatTile label={t("Expected cash in")} value={formatMoney(week.reduce((s, d) => s + d.cashIn, 0), { whole: true })} icon={<ArrowDownToLine className="h-4 w-4" />} hint={t("Next 7 days")} />
          </div>

          <ChartCard
            title={t("Cash and float: last 14 days and next 7")}
            description={t("Solid: end-of-day balances from your ledger · Dashed: projection · Red: a busy day could run short")}
            xKey="label"
            data={rows.map((r) => ({ label: r.label, cash: Number(r.cash ?? r.cashProj ?? 0), float: Number(r.float ?? r.floatProj ?? 0) }))}
            series={[
              { key: "cash", label: t("Cash in hand") },
              { key: "float", label: t("E-money float") },
            ]}
            refreshing={q.refreshing}
            legend={
              <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label={t("Legend")}>
                <LegendKey color={SERIES_COLORS[0]} label={t("Cash in hand")} />
                <LegendKey color={SERIES_COLORS[1]} label={t("E-money float")} />
                <LegendKey color="#64748b" label={t("Projection")} shape="dashed" />
                <LegendKey color="#e11d48" label={t("At risk on a busy day")} shape="dot" />
              </ul>
            }
          >
            <ProjectionChart
              rows={rows}
              lines={[
                { history: "cash", projection: "cashProj", risk: "cashRisk", label: t("Cash in hand") },
                { history: "float", projection: "floatProj", risk: "floatRisk", label: t("E-money float") },
              ]}
            />
          </ChartCard>

          <Card>
            <CardHeader
              title={t("Day by day")}
              description={
                uplift && uplift > 1.05
                  ? t("Cash-outs usually run {pct}% higher on days 1–5 of the month (salary days).", { pct: Math.round((uplift - 1) * 100) })
                  : t("Expected flows include your usual weekday pattern.")
              }
            />
            <div className="overflow-x-auto px-2 pb-2 sm:px-3">
              <Table>
                <THead>
                  <TH>{t("Day")}</TH>
                  <TH align="right">{t("Expected cash out")}</TH>
                  <TH align="right">{t("Expected cash in")}</TH>
                  <TH align="right">{t("Cash at start")}</TH>
                  <TH align="right">{t("Float at start")}</TH>
                  <TH>{t("Status")}</TH>
                </THead>
                <tbody>
                  {l.days.map((d, i) => (
                    <TR key={d.date}>
                      <TD className="whitespace-nowrap font-medium text-slate-900">
                        {localizeMonths(lang, d.label)}
                        {i === 0 && <span className="ml-1.5 text-xs font-normal text-slate-500">{t("Today")}</span>}
                      </TD>
                      <TD align="right" className="tabular">{formatMoney(d.cashOut, { whole: true })}</TD>
                      <TD align="right" className="tabular">{formatMoney(d.cashIn + d.otherCashIn, { whole: true })}</TD>
                      <TD align="right" className={cn("tabular", d.cashAtRisk && "font-semibold text-rose-600")}>{formatMoney(d.openingCash, { whole: true })}</TD>
                      <TD align="right" className={cn("tabular", d.floatAtRisk && "font-semibold text-rose-600")}>{formatMoney(d.openingFloat, { whole: true })}</TD>
                      <TD>
                        {d.cashAtRisk || d.floatAtRisk ? (
                          <Badge tone="danger" icon={<TriangleAlert className="h-3.5 w-3.5" aria-hidden />}>
                            {d.cashAtRisk ? t("Cash at risk") : t("Float at risk")}
                          </Badge>
                        ) : (
                          <Badge tone="success" icon={<CircleCheck className="h-3.5 w-3.5" aria-hidden />}>
                            {t("OK")}
                          </Badge>
                        )}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>
          </Card>
        </>
      )}

      <AgentPerformanceSection />
    </div>
  );
}

/* ───────────── Performance ───────────── */

const SERVICE_LABEL = { CASH_IN: msg("Cash In"), CASH_OUT: msg("Cash Out"), MOBILE_RECHARGE: msg("Mobile Recharge"), BILL_PAYMENT: msg("Bill Payment") } as const;

function AgentPerformanceSection() {
  const { t } = useI18n();
  const aiLang = useInsightLang();
  const q = useApi(() => api.insights.performance(), [aiLang], { tags: ["transactions"] });
  const p = q.data;
  if (q.error && !p) return <ErrorState message={q.error.message} onRetry={q.reload} />;
  const commissionGrowth = p && p.commissionPrev28 > 0 ? ((p.commission28 - p.commissionPrev28) / p.commissionPrev28) * 100 : null;

  return (
    <section aria-label={t("Performance")} className="space-y-4">
      <SectionTitle>{t("Performance — last 28 days")}</SectionTitle>
      {!p ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label={t("Volume")} value={formatMoney(p.volume28, { whole: true })} icon={<TrendingUp className="h-4 w-4" />} delta={p.growthPct} deltaLabel={t("vs previous 28 days")} />
            <StatTile label={t("Commission")} value={formatMoney(p.commission28)} icon={<Percent className="h-4 w-4" />} delta={commissionGrowth} deltaLabel={t("vs previous 28 days")} />
            <StatTile label={t("Transactions")} value={formatCount(p.transactions28)} icon={<ArrowDownToLine className="h-4 w-4" />} hint={t("{pct}% failed", { pct: (p.failureRate28 * 100).toFixed(1) })} />
            <StatTile
              label={t("Your standing")}
              value={t("Top {pct}%", { pct: Math.max(1, 100 - p.rank.percentile) })}
              icon={<Medal className="h-4 w-4" />}
              hint={p.rank.scope === "DISTRICT" ? t("Among {n} agents in your district", { n: p.rank.peers }) : t("Among {n} agents", { n: p.rank.peers })}
            />
          </div>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <ChartCard title={t("Weekly volume")} description={t("Last 8 weeks")} xKey="week" data={p.weekly} series={[{ key: "volume", label: t("Volume") }]} refreshing={q.refreshing}>
              <ColumnChart data={p.weekly} xKey="week" series={[{ key: "volume", label: t("Volume") }]} />
            </ChartCard>
            <Card>
              <CardHeader title={t("What it means")} />
              <CardBody className="space-y-4">
                <AiTextBlock note={p.ai} />
                <ul className="space-y-2 border-t border-slate-100 pt-4">
                  {p.mix.map((m) => (
                    <li key={m.type} className="text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-600">{t(SERVICE_LABEL[m.type])}</span>
                        <span className="tabular font-semibold text-slate-900">{Math.round(m.share * 100)}%</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-accent-500" style={{ width: `${Math.round(m.share * 100)}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </section>
  );
}
