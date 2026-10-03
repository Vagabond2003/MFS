import type {
  AgentIntelligence,
  AgentLiquidity,
  AgentPerformance,
  BusinessCategory,
  DistrictCoverage,
  MerchantBenchmark,
  MerchantChurnRisk,
  MerchantDemand,
} from "@/types/domain";
import { localizeMonths, msg, type Lang, type Translate } from "@/lib/i18n/core";
import { formatMoney } from "@/lib/utils";
import type { MerchantSignal } from "@/services/mock/intelligence";
import { recommendationsOutput, textOutput, type RecommendationsOutput, type TextOutput } from "./guard";

/**
 * The insights the AI layer can put into words. For each one:
 *   facts     — what the model sees: aggregated, already-computed figures plus
 *               category/district. Never names, phone numbers, NIDs, addresses
 *               or transaction ids.
 *   task      — what to write.
 *   template  — the same message without a model, in English or Bengali.
 */

const money = (minor: number) => formatMoney(minor, { whole: true });
const pct = (share: number) => Math.round(share * 100);
const hourRange = (h: number) => `${String(h).padStart(2, "0")}:00–${String((h + 1) % 24).padStart(2, "0")}:00`;
const DAY_NAMES = [msg("Sunday"), msg("Monday"), msg("Tuesday"), msg("Wednesday"), msg("Thursday"), msg("Friday"), msg("Saturday")];
const CATEGORY_LABEL: Record<BusinessCategory, string> = {
  RESTAURANT: "Restaurant",
  GROCERY: "Grocery",
  RETAIL: "Retail",
  ECOMMERCE: "E-commerce",
  PHARMACY: "Pharmacy",
  SERVICES: "Services",
  OTHER: "Other",
};

/* ───────────── Agent: liquidity ───────────── */

export interface LiquidityFacts {
  district: string | null;
  cash_in_hand: string;
  e_money_float: string;
  expected_cash_out_next_7_days: string;
  expected_cash_in_next_7_days: string;
  shortfall: { type: string; on: string; you_would_start_with: string; a_busy_day_could_need: string } | null;
  suggested_actions: { code: "FLOAT_TOP_UP" | "ADD_CASH" | "SETTLE_TO_BANK"; action: string; amount: string; before: string }[];
  low_cash_days_in_last_30: number;
  cash_out_rise_on_days_1_to_5_pct: number | null;
}

const ACTION_TEXT = {
  FLOAT_TOP_UP: "top up e-money float by depositing outlet cash",
  ADD_CASH: "bring more cash to the counter",
  SETTLE_TO_BANK: "settle surplus e-money to the bank",
} as const;

export function liquidityFacts(l: AgentLiquidity, district: string | null): LiquidityFacts {
  const week = l.days.slice(1);
  const labelOf = (date: string) => l.days.find((d) => d.date === date)?.label ?? date;
  const uplift = l.cashOutForecast.monthStartUplift;
  return {
    district,
    cash_in_hand: money(l.cashInHand),
    e_money_float: money(l.float),
    expected_cash_out_next_7_days: money(week.reduce((s, d) => s + d.cashOut, 0)),
    expected_cash_in_next_7_days: money(week.reduce((s, d) => s + d.cashIn, 0)),
    shortfall: l.shortfall
      ? { type: l.shortfall.kind === "CASH" ? msg("cash") : msg("e-money float"), on: l.shortfall.label, you_would_start_with: money(l.shortfall.opening), a_busy_day_could_need: money(l.shortfall.demand) }
      : null,
    suggested_actions: l.suggestions.map((s) => ({ code: s.kind, action: ACTION_TEXT[s.kind], amount: money(s.amount), before: labelOf(s.byDate) })),
    low_cash_days_in_last_30: l.lowCashDays30,
    cash_out_rise_on_days_1_to_5_pct: uplift && uplift > 1.05 ? Math.round((uplift - 1) * 100) : null,
  };
}

function liquidityTemplate(f: LiquidityFacts, t: Translate, lang: Lang): TextOutput {
  const parts: string[] = [];
  if (f.shortfall) {
    parts.push(
      t("Your {kind} may run short on {date}: you'd start the day with {opening}, but a busy day could need {demand}.", {
        kind: t(f.shortfall.type),
        date: localizeMonths(lang, f.shortfall.on),
        opening: f.shortfall.you_would_start_with,
        demand: f.shortfall.a_busy_day_could_need,
      }),
    );
  } else {
    parts.push(t("Cash and e-money float look sufficient for the next 7 days. Expected cash-outs: {cashOut}; cash-ins: {cashIn}.", { cashOut: f.expected_cash_out_next_7_days, cashIn: f.expected_cash_in_next_7_days }));
  }
  for (const a of f.suggested_actions.slice(0, 2)) {
    const date = localizeMonths(lang, a.before);
    if (a.code === "FLOAT_TOP_UP") parts.push(t("Top up your e-money float by {amount} before {date}.", { amount: a.amount, date }));
    else if (a.code === "ADD_CASH") parts.push(t("Bring {amount} more cash to the counter before {date}.", { amount: a.amount, date }));
    else parts.push(t("You could settle {amount} of surplus e-money to your bank.", { amount: a.amount }));
  }
  return { text: parts.join(" ") };
}

/* ───────────── Agent: performance ───────────── */

export interface PerformanceFacts {
  volume_last_28_days: string;
  change_vs_previous_28_days_pct: number | null;
  commission_last_28_days: string;
  commission_change_pct: number | null;
  transactions_last_28_days: number;
  ahead_of_pct_of_agents: number;
  compared_with: "agents in the same district" | "all agents";
  failed_attempts_pct: number;
  low_cash_days_in_last_30: number;
  main_service: string;
  main_service_share_pct: number;
}

const SERVICE_LABEL = { CASH_IN: "Cash In", CASH_OUT: "Cash Out", MOBILE_RECHARGE: "Mobile Recharge", BILL_PAYMENT: "Bill Payment" } as const;

export function performanceFacts(p: AgentPerformance): PerformanceFacts {
  const main = [...p.mix].sort((a, b) => b.volume - a.volume)[0];
  const commissionChange = p.commissionPrev28 > 0 ? Math.round(((p.commission28 - p.commissionPrev28) / p.commissionPrev28) * 1000) / 10 : null;
  return {
    volume_last_28_days: money(p.volume28),
    change_vs_previous_28_days_pct: p.growthPct,
    commission_last_28_days: money(p.commission28),
    commission_change_pct: commissionChange,
    transactions_last_28_days: p.transactions28,
    ahead_of_pct_of_agents: p.rank.percentile,
    compared_with: p.rank.scope === "DISTRICT" ? "agents in the same district" : "all agents",
    failed_attempts_pct: Math.round(p.failureRate28 * 1000) / 10,
    low_cash_days_in_last_30: p.lowCashDays30,
    main_service: SERVICE_LABEL[main?.type ?? "CASH_OUT"],
    main_service_share_pct: pct(main?.share ?? 0),
  };
}

function performanceTemplate(f: PerformanceFacts, t: Translate): TextOutput {
  const change = f.change_vs_previous_28_days_pct;
  const vars = { volume: f.volume_last_28_days, commission: f.commission_last_28_days, pct: Math.abs(change ?? 0), rank: f.ahead_of_pct_of_agents };
  const parts = [
    change === null
      ? t("Your volume over the last 28 days was {volume}, with {commission} earned in commission.", vars)
      : change >= 0
        ? t("Your volume over the last 28 days was {volume}, up {pct}% on the 28 days before, with {commission} earned in commission.", vars)
        : t("Your volume over the last 28 days was {volume}, down {pct}% on the 28 days before, with {commission} earned in commission.", vars),
    f.compared_with === "all agents"
      ? t("You're ahead of {rank}% of agents.", vars)
      : t("You're ahead of {rank}% of agents in your district.", vars),
  ];
  if (f.low_cash_days_in_last_30 >= 5) parts.push(t("{n} of the last 30 days ended with very little cash — keep more cash at the counter.", { n: f.low_cash_days_in_last_30 }));
  return { text: parts.join(" ") };
}

/* ───────────── Merchant: demand ───────────── */

export interface DemandFacts {
  category: string;
  district: string | null;
  expected_sales_next_7_days: string;
  likely_range_low: string;
  likely_range_high: string;
  busiest_weekday: string | null;
  busiest_hours: string[];
  trend_pct_per_week: number;
  start_of_month_sales_rise_pct: number | null;
  repeat_customer_sales_pct: number;
}

export function demandFacts(d: MerchantDemand, category: BusinessCategory, district: string | null): DemandFacts {
  const uplift = d.revenueForecast.monthStartUplift;
  return {
    category: CATEGORY_LABEL[category],
    district,
    expected_sales_next_7_days: money(d.nextWeek.value),
    likely_range_low: money(d.nextWeek.low),
    likely_range_high: money(d.nextWeek.high),
    busiest_weekday: d.busiestWeekday === null ? null : DAY_NAMES[d.busiestWeekday],
    busiest_hours: [...d.busiestHours].sort((a, b) => a - b).map(hourRange),
    trend_pct_per_week: d.revenueForecast.trendPerWeekPct,
    start_of_month_sales_rise_pct: uplift && uplift > 1.05 ? Math.round((uplift - 1) * 100) : null,
    repeat_customer_sales_pct: pct(d.breakdown.repeatShare),
  };
}

function demandTemplate(f: DemandFacts, t: Translate): TextOutput {
  const parts = [t("Expect about {value} in sales over the next 7 days (likely {low} to {high}).", { value: f.expected_sales_next_7_days, low: f.likely_range_low, high: f.likely_range_high })];
  if (f.busiest_weekday) parts.push(t("{day} is usually your busiest day.", { day: t(f.busiest_weekday) }));
  if (f.busiest_hours.length) parts.push(t("Your busiest hours are {hours}.", { hours: f.busiest_hours.join(", ") }));
  return { text: parts.join(" ") };
}

/* ───────────── Merchant: benchmark ───────────── */

export interface BenchmarkFacts {
  category: string;
  compared_with: "merchants in the same category and district" | "merchants in the same category" | "all merchants";
  peer_merchants: number;
  metrics: { metric: string; yours: string; peer_median: string; ahead_of_pct_of_peers: number }[];
}

const METRIC_LABEL = {
  revenue: msg("sales (30 days)"),
  avgTicket: msg("average payment"),
  repeatRate: msg("repeat customers"),
  qrShare: msg("QR payments"),
  failureRate: msg("failed payments"),
};

export function benchmarkFacts(b: MerchantBenchmark): BenchmarkFacts {
  const show = (key: keyof typeof METRIC_LABEL, v: number) => (key === "revenue" || key === "avgTicket" ? money(v) : `${pct(v)}%`);
  return {
    category: CATEGORY_LABEL[b.category],
    compared_with: b.scope === "CATEGORY_DISTRICT" ? "merchants in the same category and district" : b.scope === "CATEGORY" ? "merchants in the same category" : "all merchants",
    peer_merchants: b.peerCount,
    metrics: b.metrics.map((m) => ({ metric: METRIC_LABEL[m.key], yours: show(m.key, m.value), peer_median: show(m.key, m.peerMedian), ahead_of_pct_of_peers: m.percentile })),
  };
}

function benchmarkTemplate(f: BenchmarkFacts, t: Translate): TextOutput {
  if (!f.metrics.length || !f.peer_merchants) return { text: t("There aren't enough similar merchants yet for a comparison.") };
  const sorted = [...f.metrics].sort((a, b) => b.ahead_of_pct_of_peers - a.ahead_of_pct_of_peers);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const parts = [t("Compared with {n} similar merchants, your {metric} is ahead of {pct}% of them.", { n: f.peer_merchants, metric: t(best.metric), pct: best.ahead_of_pct_of_peers })];
  if (worst !== best && worst.ahead_of_pct_of_peers < 50) {
    parts.push(t("The area to improve is {metric}: {yours} against a typical {median}.", { metric: t(worst.metric), yours: worst.yours, median: worst.peer_median }));
  }
  return { text: parts.join(" ") };
}

/* ───────────── Merchant: recommendations ───────────── */

export interface RecommendationFacts {
  category: string;
  district: string | null;
  signals: Record<string, string | number>[];
}

export function recommendationFacts(signals: MerchantSignal[], category: BusinessCategory, district: string | null): RecommendationFacts {
  return {
    category: CATEGORY_LABEL[category],
    district,
    signals: signals.map((s): Record<string, string | number> => {
      const d = s.data;
      switch (s.code) {
        case "WIN_BACK":
          return { topic: s.code, payments_last_14_days: d.paymentsLast14 as number, payments_previous_14_days: d.paymentsPrevious14 as number };
        case "REDUCE_FAILURES":
          return { topic: s.code, your_failed_payment_rate: `${pct(d.failureRate as number)}%`, similar_merchants_failed_payment_rate: `${pct(d.peerMedian as number)}%` };
        case "MONTH_START":
          return { topic: s.code, usual_sales_rise_on_days_1_to_5_of_month: `${d.upliftPct as number}%`, busier_days_from: d.from as string, busier_days_to: d.to as string };
        case "BUSY_DAY_AHEAD":
          return { topic: s.code, day: d.day as string, date: d.date as string, expected_sales: money(d.expectedRevenue as number) };
        case "PROMOTE_QR":
          return { topic: s.code, your_payments_made_by_qr: `${pct(d.qrShare as number)}%`, similar_merchants_payments_made_by_qr: `${pct(d.peerMedian as number)}%` };
        case "BUILD_LOYALTY":
          return { topic: s.code, your_customers_who_came_back: `${pct(d.repeatRate as number)}%`, similar_merchants_customers_who_came_back: `${pct(d.peerMedian as number)}%` };
        case "PEAK_HOURS":
          return { topic: s.code, busiest_hours: (d.hours as number[]).map(hourRange).join(", ") };
      }
    }),
  };
}

function recommendationsTemplate(f: RecommendationFacts, t: Translate, lang: Lang): RecommendationsOutput {
  const s = (v: string | number) => String(v);
  return {
    items: f.signals.map((x) => {
      switch (x.topic) {
        case "WIN_BACK":
          return { title: t("Win back regular customers"), detail: t("Payments fell to {now} in the last 14 days from {before} in the 14 days before. Reach out to regulars with a small offer.", { now: x.payments_last_14_days, before: x.payments_previous_14_days }) };
        case "REDUCE_FAILURES":
          return { title: t("Cut failed payments"), detail: t("{rate} of payment attempts failed, against {median} for similar merchants. Check the QR display and the network at your counter.", { rate: s(x.your_failed_payment_rate), median: s(x.similar_merchants_failed_payment_rate) }) };
        case "MONTH_START":
          return { title: t("Get ready for salary days"), detail: t("Sales usually rise about {rise} on days 1–5 of the month. Expect busier days from {from} to {to} — stock up and plan extra staff.", { rise: s(x.usual_sales_rise_on_days_1_to_5_of_month), from: localizeMonths(lang, s(x.busier_days_from)), to: localizeMonths(lang, s(x.busier_days_to)) }) };
        case "BUSY_DAY_AHEAD":
          return { title: t("Prepare for {day}", { day: t(s(x.day)) }), detail: t("{day}, {date} looks like your busiest day this week, with about {amount} in expected sales.", { day: t(s(x.day)), date: localizeMonths(lang, s(x.date)), amount: s(x.expected_sales) }) };
        case "PROMOTE_QR":
          return { title: t("Promote QR payments"), detail: t("{yours} of your payments use QR, against {median} for similar merchants. Display your QR code where customers pay.", { yours: s(x.your_payments_made_by_qr), median: s(x.similar_merchants_payments_made_by_qr) }) };
        case "BUILD_LOYALTY":
          return { title: t("Bring customers back"), detail: t("{yours} of your customers paid more than once this month, against {median} for similar merchants. Try a small reward for repeat visits.", { yours: s(x.your_customers_who_came_back), median: s(x.similar_merchants_customers_who_came_back) }) };
        default:
          return { title: t("Staff up at peak hours"), detail: t("Most payments come in at {hours}. Make sure the counter is staffed then.", { hours: s(x.busiest_hours) }) };
      }
    }),
  };
}

/* ───────────── Admin ───────────── */

export interface ChurnFacts {
  merchants_scored: number;
  high_risk: number;
  medium_risk: number;
  most_common_reason: string | null;
  high_risk_by_district: { district: string; merchants: number }[];
}

const REASON_LABEL = {
  RECENCY: msg("no recent payments"),
  COUNT_DROP: msg("fewer payments"),
  VALUE_DROP: msg("lower sales value"),
  FAILURE_RATE: msg("failed payments"),
  REFUND_RATE: msg("refunds"),
};

export function churnFacts(list: MerchantChurnRisk[]): ChurnFacts {
  const risky = list.filter((r) => r.level !== "LOW");
  const reasons = new Map<string, number>();
  for (const r of risky) if (r.factors[0]) reasons.set(r.factors[0].key, (reasons.get(r.factors[0].key) ?? 0) + 1);
  const top = [...reasons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] as keyof typeof REASON_LABEL | undefined;
  const byDistrict = new Map<string, number>();
  for (const r of list.filter((x) => x.level === "HIGH")) byDistrict.set(r.district ?? "Unknown", (byDistrict.get(r.district ?? "Unknown") ?? 0) + 1);
  return {
    merchants_scored: list.length,
    high_risk: list.filter((r) => r.level === "HIGH").length,
    medium_risk: list.filter((r) => r.level === "MEDIUM").length,
    most_common_reason: top ? REASON_LABEL[top] : null,
    high_risk_by_district: [...byDistrict.entries()].map(([district, merchants]) => ({ district, merchants })).sort((a, b) => b.merchants - a.merchants),
  };
}

function churnTemplate(f: ChurnFacts, t: Translate): TextOutput {
  const parts = [t("{high} of {n} merchants are at high churn risk and {medium} at medium risk.", { high: f.high_risk, n: f.merchants_scored, medium: f.medium_risk })];
  if (f.most_common_reason) parts.push(t("The most common reason is {reason}.", { reason: t(f.most_common_reason) }));
  return { text: parts.join(" ") };
}

export interface AgentsFacts {
  agents_reviewed: number;
  agents_with_unusual_patterns: number;
  near_limit_cash_outs: number;
  repeated_customers: number;
  off_hours_activity: number;
  volume_spikes: number;
  rising_performers: number;
  service_gaps: number;
  service_gap_districts: string[];
}

export function agentsFacts(list: AgentIntelligence[]): AgentsFacts {
  const count = (code: string) => list.filter((a) => a.flags.some((f) => f.code === code)).length;
  return {
    agents_reviewed: list.length,
    agents_with_unusual_patterns: list.filter((a) => a.flags.length).length,
    near_limit_cash_outs: count("NEAR_LIMIT_CASH_OUTS"),
    repeated_customers: count("REPEATED_CUSTOMER"),
    off_hours_activity: count("OFF_HOURS_ACTIVITY"),
    volume_spikes: count("VOLUME_SPIKE"),
    rising_performers: list.filter((a) => a.rising).length,
    service_gaps: list.filter((a) => a.serviceGap).length,
    service_gap_districts: [...new Set(list.filter((a) => a.serviceGap && a.district).map((a) => a.district!))],
  };
}

function agentsTemplate(f: AgentsFacts, t: Translate): TextOutput {
  return {
    text: t("{flagged} of {n} agents show unusual patterns to review, {rising} are rising performers and {gaps} have service gaps.", {
      flagged: f.agents_with_unusual_patterns,
      n: f.agents_reviewed,
      rising: f.rising_performers,
      gaps: f.service_gaps,
    }),
  };
}

export interface CoverageFacts {
  districts: number;
  most_underserved: string | null;
  customers_per_agent: number | null;
  network_median_customers_per_agent: number;
  extra_agents_needed: number;
  next_most_underserved: string | null;
}

export function coverageFacts(list: DistrictCoverage[]): CoverageFacts {
  const perAgent = list.map((c) => c.customersPerAgent).filter((v): v is number => v !== null).sort((a, b) => a - b);
  const median = perAgent.length ? (perAgent.length % 2 ? perAgent[perAgent.length >> 1] : (perAgent[perAgent.length / 2 - 1] + perAgent[perAgent.length / 2]) / 2) : 0;
  return {
    districts: list.length,
    most_underserved: list[0]?.district ?? null,
    customers_per_agent: list[0]?.customersPerAgent ?? null,
    network_median_customers_per_agent: Math.round(median * 10) / 10,
    extra_agents_needed: list[0]?.agentsNeeded ?? 0,
    next_most_underserved: list[1]?.district ?? null,
  };
}

function coverageTemplate(f: CoverageFacts, t: Translate): TextOutput {
  if (!f.most_underserved) return { text: t("No district data yet. Add districts to agents and merchants to see coverage.") };
  return {
    text: t("{district} is the most underserved district: {perAgent} customers per agent against a network median of {median}. About {agents} more agents would bring it to the median.", {
      district: t(f.most_underserved),
      perAgent: f.customers_per_agent ?? "—",
      median: f.network_median_customers_per_agent,
      agents: f.extra_agents_needed,
    }),
  };
}

/* ───────────── Registry ───────────── */

type Audience = "agent" | "merchant" | "admin";

interface KindDef<F, O> {
  audience: Audience;
  output: "text" | "recommendations";
  task: string;
  template: (facts: F, t: Translate, lang: Lang) => O;
}
const text = <F,>(def: Omit<KindDef<F, TextOutput>, "output">): KindDef<F, TextOutput> => ({ ...def, output: "text" });

export const KINDS = {
  "agent.liquidity": text<LiquidityFacts>({
    audience: "agent",
    task: "Write one or two short sentences for the agent about cash in hand and e-money float for the coming week: whether a shortfall is likely and which suggested action to take.",
    template: liquidityTemplate,
  }),
  "agent.performance": text<PerformanceFacts>({
    audience: "agent",
    task: "Write one or two short sentences summarising the agent's last 28 days and one practical next step.",
    template: performanceTemplate,
  }),
  "merchant.demand": text<DemandFacts>({
    audience: "merchant",
    task: "Write one or two short sentences explaining the 7-day sales forecast and when the shop is busiest.",
    template: demandTemplate,
  }),
  "merchant.benchmark": text<BenchmarkFacts>({
    audience: "merchant",
    task: "Write one or two short sentences on where the merchant does better and worse than similar merchants.",
    template: benchmarkTemplate,
  }),
  "merchant.recommendations": {
    audience: "merchant",
    output: "recommendations",
    task: "Write exactly one recommendation per signal, in the same order: a short title (at most 8 words) and a 1–2 sentence detail that uses that signal's figures.",
    template: recommendationsTemplate,
  } satisfies KindDef<RecommendationFacts, RecommendationsOutput>,
  "admin.churn": text<ChurnFacts>({
    audience: "admin",
    task: "Write one or two short sentences for the operations team summarising merchant churn risk and what to do first.",
    template: churnTemplate,
  }),
  "admin.agents": text<AgentsFacts>({
    audience: "admin",
    task: "Write one or two short sentences for the operations team summarising agent patterns to review, rising performers and service gaps.",
    template: agentsTemplate,
  }),
  "admin.coverage": text<CoverageFacts>({
    audience: "admin",
    task: "Write one or two short sentences for the operations team on which district is most underserved and how many agents it needs.",
    template: coverageTemplate,
  }),
} as const;

export type InsightKind = keyof typeof KINDS;
export type FactsOf<K extends InsightKind> = Parameters<(typeof KINDS)[K]["template"]>[0];
export type OutputOf<K extends InsightKind> = ReturnType<(typeof KINDS)[K]["template"]>;
export const schemaFor = (kind: InsightKind) => (KINDS[kind].output === "recommendations" ? recommendationsOutput : textOutput);
