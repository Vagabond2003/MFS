"use client";

import { useState } from "react";
import { Activity, ChevronDown, CircleAlert, MapPinned, Rocket, Store, Users } from "lucide-react";
import { ChartCard, ColumnChart } from "@/components/charts/charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/data";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useApi } from "@/hooks/use-api";
import { useI18n } from "@/hooks/use-i18n";
import { msg, type Translate } from "@/lib/i18n/core";
import { cn, formatCount, formatMoney } from "@/lib/utils";
import { api } from "@/services";
import type { AgentFlag, AgentFlagCode, ChurnFactor, MerchantChurnRisk } from "@/types/domain";
import { CATEGORY_META } from "../register/merchant-form";
import { AiTextBlock } from "./ai-note";
import { useInsightLang } from "./agent";

export function AdminIntelligenceView() {
  const { t } = useI18n();
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t("Intelligence")}
        title={t("Network intelligence")}
        description={t("Merchant churn risk, agent patterns and district coverage, computed from the ledger. Summaries explain the figures; decisions stay with your team.")}
      />
      <ChurnSection />
      <AgentsSection />
      <CoverageSection />
    </div>
  );
}

function SectionCard({ icon, title, description, children }: { icon: React.ReactNode; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader icon={icon} title={title} description={description} />
      <CardBody className="space-y-5">{children}</CardBody>
    </Card>
  );
}

/* ───────────── Churn ───────────── */

const LEVEL_TONE = { HIGH: "danger", MEDIUM: "warning", LOW: "success" } as const;
const LEVEL_LABEL = { HIGH: msg("High"), MEDIUM: msg("Medium"), LOW: msg("Low") } as const;

function factorText(f: ChurnFactor, t: Translate) {
  const pct = Math.round(f.value * 100);
  switch (f.key) {
    case "RECENCY":
      return t("No payment for {n} days", { n: f.value });
    case "COUNT_DROP":
      return t("Payments down {pct}%", { pct });
    case "VALUE_DROP":
      return t("Sales down {pct}%", { pct });
    case "FAILURE_RATE":
      return t("{pct}% of payments failed", { pct });
    case "REFUND_RATE":
      return t("{pct}% refunded", { pct });
  }
}

function ChurnSection() {
  const { t } = useI18n();
  const aiLang = useInsightLang();
  const q = useApi(() => api.insights.churnRisk(), [aiLang], { tags: ["admin"] });
  const [showAll, setShowAll] = useState(false);
  const c = q.data;
  const atRisk = c?.merchants.filter((m) => m.level !== "LOW") ?? [];
  const shown: MerchantChurnRisk[] = c ? (showAll ? c.merchants : c.merchants.slice(0, Math.max(10, atRisk.length))) : [];

  return (
    <SectionCard icon={<Store className="h-4 w-4" />} title={t("Merchant churn risk")} description={t("Merchants likely to stop using Kosh, scored 0–100 from recent payment activity.")}>
      {q.error && !c ? (
        <ErrorState message={q.error.message} onRetry={q.reload} />
      ) : !c ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : !c.merchants.length ? (
        <EmptyState icon={<Store className="h-6 w-6" />} title={t("No merchants to score yet")} />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <AiTextBlock note={c.ai} />
            <div className="flex gap-2">
              <Badge tone="danger">{t("{n} high", { n: c.merchants.filter((m) => m.level === "HIGH").length })}</Badge>
              <Badge tone="warning">{t("{n} medium", { n: c.merchants.filter((m) => m.level === "MEDIUM").length })}</Badge>
              <Badge tone="neutral">{t("{n} scored", { n: c.merchants.length })}</Badge>
            </div>
          </div>
          <div className="-mx-2 overflow-x-auto sm:-mx-3">
            <Table>
              <THead>
                <TH>{t("Merchant")}</TH>
                <TH>{t("District")}</TH>
                <TH>{t("Risk")}</TH>
                <TH>{t("Why")}</TH>
                <TH align="right">{t("Payments (14 days)")}</TH>
              </THead>
              <tbody>
                {shown.map((m) => (
                  <TR key={m.userId}>
                    <TD>
                      <p className="font-medium text-slate-900">{m.businessName}</p>
                      <p className="text-xs text-slate-500">
                        {m.merchantId} · {t(CATEGORY_META[m.category].label)}
                      </p>
                    </TD>
                    <TD className="whitespace-nowrap">{m.district ? t(m.district) : "—"}</TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                          <div className={cn("h-full rounded-full", m.level === "HIGH" ? "bg-rose-500" : m.level === "MEDIUM" ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${m.score}%` }} />
                        </div>
                        <span className="tabular w-7 text-sm font-semibold text-slate-900">{m.score}</span>
                        <Badge tone={LEVEL_TONE[m.level]}>{t(LEVEL_LABEL[m.level])}</Badge>
                      </div>
                    </TD>
                    <TD>
                      <ul className="flex flex-wrap gap-1">
                        {m.factors
                          .filter((f) => f.points > 0)
                          .slice(0, 3)
                          .map((f) => (
                            <li key={f.key} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                              {factorText(f, t)}
                            </li>
                          ))}
                      </ul>
                    </TD>
                    <TD align="right" className="tabular whitespace-nowrap">
                      {m.count14} <span className="text-xs text-slate-400">{t("vs {n}", { n: m.prevCount14 })}</span>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>
          {c.merchants.length > shown.length && (
            <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
              <ChevronDown className="h-4 w-4" aria-hidden /> {t("Show all {n} merchants", { n: c.merchants.length })}
            </Button>
          )}
        </>
      )}
    </SectionCard>
  );
}

/* ───────────── Agents ───────────── */

const FLAG_LABEL: Record<AgentFlagCode, string> = {
  NEAR_LIMIT_CASH_OUTS: msg("Near-limit cash-outs"),
  REPEATED_CUSTOMER: msg("Repeated customers"),
  OFF_HOURS_ACTIVITY: msg("Off-hours activity"),
  VOLUME_SPIKE: msg("Volume spike"),
};

function flagDetail(f: AgentFlag, t: Translate) {
  const pct = (v: number) => Math.round(v * 100);
  switch (f.code) {
    case "NEAR_LIMIT_CASH_OUTS":
      return t("{pct}% of cash-outs within 5% of the per-transaction limit (typical {median}%)", { pct: pct(f.value), median: pct(f.peerMedian) });
    case "REPEATED_CUSTOMER":
      return t("{n} times a customer made 3+ transactions in one day (typical {median})", { n: f.value, median: f.peerMedian });
    case "OFF_HOURS_ACTIVITY":
      return t("{pct}% of transactions between 23:00 and 06:00 (typical {median}%)", { pct: pct(f.value), median: pct(f.peerMedian) });
    case "VOLUME_SPIKE":
      return t("Last 7 days at {x}× the usual weekly volume", { x: f.value.toFixed(1) });
  }
}

function AgentsSection() {
  const { t } = useI18n();
  const aiLang = useInsightLang();
  const q = useApi(() => api.insights.agentIntelligence(), [aiLang], { tags: ["admin"] });
  const a = q.data;
  const flagged = a?.agents.filter((x) => x.flags.length).sort((x, y) => Number(y.flags.some((f) => f.severity === "HIGH")) - Number(x.flags.some((f) => f.severity === "HIGH"))) ?? [];
  const rising = a?.agents.filter((x) => x.rising).sort((x, y) => (y.transactionsGrowthPct ?? 0) - (x.transactionsGrowthPct ?? 0)) ?? [];
  const gaps = a?.agents.filter((x) => x.serviceGap) ?? [];

  return (
    <SectionCard icon={<Activity className="h-4 w-4" />} title={t("Agent intelligence")} description={t("Last 28 days compared with peers and with each agent's own previous 8 weeks.")}>
      {q.error && !a ? (
        <ErrorState message={q.error.message} onRetry={q.reload} />
      ) : !a ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : (
        <>
          <AiTextBlock note={a.ai} />
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="rounded-xl border border-slate-200 p-4 xl:col-span-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <CircleAlert className="h-4 w-4 text-rose-500" aria-hidden /> {t("Patterns to review")}
                <span className="font-normal text-slate-500">({flagged.length})</span>
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">{t("Statistical patterns worth a look — not proof of wrongdoing.")}</p>
              {!flagged.length ? (
                <p className="mt-3 text-sm text-slate-500">{t("No unusual patterns in the last 28 days.")}</p>
              ) : (
                <ul className="mt-3 grid gap-3 md:grid-cols-2">
                  {flagged.map((x) => (
                    <li key={x.userId} className="rounded-lg bg-slate-50 p-3">
                      <p className="text-sm font-semibold text-slate-900">
                        {x.outletName} <span className="font-normal text-slate-500">· {x.agentCode}{x.district ? ` · ${t(x.district)}` : ""}</span>
                      </p>
                      <ul className="mt-2 space-y-1.5">
                        {x.flags.map((f) => (
                          <li key={f.code} className="text-xs text-slate-600">
                            <Badge tone={f.severity === "HIGH" ? "danger" : "warning"} className="mr-1.5">
                              {t(FLAG_LABEL[f.code])}
                            </Badge>
                            {flagDetail(f, t)}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 p-4 xl:col-span-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Rocket className="h-4 w-4 text-emerald-600" aria-hidden /> {t("Rising performers")}
                <span className="font-normal text-slate-500">({rising.length})</span>
              </h3>
              {!rising.length ? (
                <p className="mt-3 text-sm text-slate-500">{t("No agent is growing fast right now.")}</p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100">
                  {rising.map((x) => (
                    <li key={x.userId} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="font-medium text-slate-900">{x.outletName}</span>{" "}
                        <span className="text-xs text-slate-500">{x.district ? t(x.district) : ""}</span>
                      </span>
                      <span className="tabular shrink-0 text-xs text-slate-600">
                        <span className="font-semibold text-emerald-700">+{x.transactionsGrowthPct}%</span> {t("transactions")} ·{" "}
                        <span className="font-semibold text-emerald-700">+{x.growthPct}%</span> {t("volume")} · {formatMoney(x.volume28, { whole: true })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <MapPinned className="h-4 w-4 text-amber-600" aria-hidden /> {t("Service gaps")}
                <span className="font-normal text-slate-500">({gaps.length})</span>
              </h3>
              {!gaps.length ? (
                <p className="mt-3 text-sm text-slate-500">{t("Every agent kept enough cash.")}</p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100">
                  {gaps.map((x) => (
                    <li key={x.userId} className="py-2 text-sm">
                      <p className="font-medium text-slate-900">
                        {x.outletName} <span className="text-xs font-normal text-slate-500">{x.district ? t(x.district) : ""}</span>
                      </p>
                      <p className="text-xs text-slate-600">
                        {t("{n} low-cash days of 30 · {pct}% failed", { n: x.serviceGap!.lowCashDays30, pct: (x.serviceGap!.failureRate28 * 100).toFixed(1) })}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </SectionCard>
  );
}

/* ───────────── Coverage ───────────── */

function CoverageSection() {
  const { t } = useI18n();
  const aiLang = useInsightLang();
  const q = useApi(() => api.insights.locationCoverage(), [aiLang], { tags: ["admin"] });
  const c = q.data;
  const chart = c?.districts.map((d) => ({ district: t(d.district), customersPerAgent: d.customersPerAgent ?? 0 })) ?? [];

  return (
    <SectionCard icon={<Users className="h-4 w-4" />} title={t("District coverage")} description={t("Customers served per agent and merchant over the last 30 days. Most underserved first.")}>
      {q.error && !c ? (
        <ErrorState message={q.error.message} onRetry={q.reload} />
      ) : !c ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : !c.districts.length ? (
        <EmptyState icon={<MapPinned className="h-6 w-6" />} title={t("No district data yet")} description={t("Add districts to agents and merchants to see coverage.")} />
      ) : (
        <>
          <AiTextBlock note={c.ai} />
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <ChartCard title={t("Customers per agent")} description={t("Higher means each agent serves more people")} xKey="district" data={chart} series={[{ key: "customersPerAgent", label: t("Customers per agent") }]} format="count" refreshing={q.refreshing}>
              <ColumnChart data={chart} xKey="district" series={[{ key: "customersPerAgent", label: t("Customers per agent") }]} format="count" />
            </ChartCard>
            <div className="-mx-2 overflow-x-auto sm:-mx-3">
              <Table>
                <THead>
                  <TH>#</TH>
                  <TH>{t("District")}</TH>
                  <TH align="right">{t("Agents")}</TH>
                  <TH align="right">{t("Merchants")}</TH>
                  <TH align="right">{t("Customers")}</TH>
                  <TH align="right">{t("Per agent")}</TH>
                  <TH align="right">{t("Agents needed")}</TH>
                </THead>
                <tbody>
                  {c.districts.map((d) => (
                    <TR key={d.district} className={cn(d.rank === 1 && "bg-amber-50/60")}>
                      <TD className="tabular text-slate-500">{d.rank}</TD>
                      <TD className="whitespace-nowrap font-medium text-slate-900">{t(d.district)}</TD>
                      <TD align="right" className="tabular">{d.agents}</TD>
                      <TD align="right" className="tabular">{d.merchants}</TD>
                      <TD align="right" className="tabular">{formatCount(d.customers30)}</TD>
                      <TD align="right" className="tabular">{d.customersPerAgent ?? "—"}</TD>
                      <TD align="right" className={cn("tabular", d.agentsNeeded > 0 && "font-semibold text-amber-700")}>{d.agentsNeeded > 0 ? `+${d.agentsNeeded}` : "—"}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>
          </div>
        </>
      )}
    </SectionCard>
  );
}
