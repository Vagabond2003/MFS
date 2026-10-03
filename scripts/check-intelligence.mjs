#!/usr/bin/env node
/**
 * Sanity checks for src/services/mock/intelligence — no test framework, no database.
 *
 *   node scripts/check-intelligence.mjs              generates the synthetic dataset offline, then checks it
 *   node scripts/check-intelligence.mjs FILE.json    checks a dataset written by seed-synthetic.mjs --emit
 */
import { checker, importSrc, loadSyntheticDb } from "./lib/synthetic-db.mjs";

const { db, now: NOW, specials: S } = loadSyntheticDb(process.argv[2]);
const intel = await importSrc("src/services/mock/intelligence/index.ts");
const { check, summary } = checker();
const finite = (v) => typeof v === "number" && Number.isFinite(v);

/* ───────────── forecast ───────────── */

{
  const pattern = [1, 1, 1, 1, 1.5, 0.5, 1]; // Sun..Sat
  const today = 20_000; // a fixed Dhaka day number
  const series = Array.from({ length: 56 }, (_, i) => 100 * pattern[new Date((today - 56 + i) * 86_400_000).getUTCDay()]);
  const f = intel.forecastSeries(series, today, {});
  check("forecast: 8 points (today + 7)", f.points.length === 8);
  check("forecast: weekday index recovers the weekly pattern", f.weekdayIndex[4] > 1.3 && f.weekdayIndex[5] < 0.7, `Thu ${f.weekdayIndex[4]}, Fri ${f.weekdayIndex[5]}`);
  check("forecast: flat series has ~no trend", Math.abs(f.trendPerWeekPct) < 2, `${f.trendPerWeekPct}%/wk`);
  check("forecast: band contains the point", f.points.every((p) => p.low <= p.value && p.value <= p.high && p.low >= 0));

  const growing = Array.from({ length: 56 }, (_, i) => 50 + 2 * i);
  const g = intel.forecastSeries(growing, today, {});
  check("forecast: rising series → positive trend and rising points", g.trendPerWeekPct > 5 && g.points[7].value > g.points[0].value, `${g.trendPerWeekPct}%/wk`);

  const salary = Array.from({ length: 56 }, (_, i) => (new Date((today - 56 + i) * 86_400_000).getUTCDate() <= 5 ? 200 : 100));
  const m = intel.forecastSeries(salary, today, { monthStart: true });
  check("forecast: start-of-month uplift detected", m.monthStartUplift !== null && Math.abs(m.monthStartUplift - 2) < 0.35, `uplift ${m.monthStartUplift}`);
}

{
  const d = intel.merchantDemand(db, "usr_nafiztong", NOW);
  check("demand: 28 days of actuals and 8 forecast points", d.actual.length === 28 && d.revenueForecast.points.length === 8);
  check("demand: integer poisha in revenue forecast", d.revenueForecast.points.every((p) => Number.isInteger(p.value) && Number.isInteger(p.low) && Number.isInteger(p.high)));
  check("demand: 24 hour buckets and up to 3 busiest hours", d.hours.length === 24 && d.busiestHours.length > 0 && d.busiestHours.length <= 3, `busiest ${d.busiestHours.join(", ")}`);
  check("demand: mix shares add up", Math.abs(d.breakdown.repeatShare + d.breakdown.newShare - 1) < 0.01 && Math.abs(d.breakdown.method.reduce((s, x) => s + x.share, 0) - 1) < 0.01);
}

/* ───────────── liquidity ───────────── */

for (const [label, id] of [["service-gap agent", S.serviceGap], ["demo agent", "usr_sabbir_tele"], ["rising agent", S.rising[0]]]) {
  const l = intel.agentLiquidity(db, id, NOW);
  const consistent = l.days.every((d) => d.closingCash === d.openingCash + d.cashIn + d.otherCashIn - d.cashOut && d.closingFloat === d.openingFloat - d.cashIn - d.otherCashIn + d.cashOut + d.commission);
  const chained = l.days.every((d, i) => i === 0 || (d.openingCash === l.days[i - 1].closingCash && d.openingFloat === l.days[i - 1].closingFloat));
  check(`liquidity (${label}): 8 projected days, balances chain day to day`, l.days.length === 8 && consistent && chained);
  check(`liquidity (${label}): starts from the real wallet`, l.days[0].openingCash === l.cashInHand && l.days[0].openingFloat === l.float);
  check(`liquidity (${label}): suggestions are positive whole ৳1,000s`, l.suggestions.every((s) => s.amount > 0 && s.amount % 100_000 === 0));
  check(`liquidity (${label}): 14 days of reconstructed history`, l.history.length === 14 && l.history.every((h) => finite(h.cash) && finite(h.float)));
}
{
  const gap = intel.agentLiquidity(db, S.serviceGap, NOW);
  check("liquidity: the overloaded Gazipur agent has frequent low-cash days", gap.lowCashDays30 >= 5, `${gap.lowCashDays30} of 30`);
  const reconstructedToday = intel.agentLiquidity(db, S.rising[0], NOW).history.every((h) => h.cash >= 0 && h.float >= 0);
  check("liquidity: reconstructed balances never go negative", reconstructedToday);
}

/* ───────────── churn ───────────── */

{
  const ranking = intel.churnRanking(db, NOW);
  const top = ranking.slice(0, S.decliners.length + 1).map((r) => r.userId);
  const declinersInTop = S.decliners.filter((id) => top.includes(id)).length;
  check(`churn: the ${S.decliners.length} declining merchants rank in the top ${S.decliners.length + 1}`, declinersInTop === S.decliners.length, `${declinersInTop}/${S.decliners.length}`);
  check("churn: decliners score at least MEDIUM", S.decliners.every((id) => ranking.find((r) => r.userId === id)?.level !== "LOW"), S.decliners.map((id) => ranking.find((r) => r.userId === id)?.score).join(", "));
  const others = ranking.filter((r) => !S.decliners.includes(r.userId)).map((r) => r.score).sort((a, b) => a - b);
  check("churn: typical merchant is low risk", others[others.length >> 1] < 35, `median ${others[others.length >> 1]}`);
  check("churn: scores within 0–100 with named factors", ranking.every((r) => r.score >= 0 && r.score <= 100 && r.factors.every((f) => f.points > 0)));
}

/* ───────────── benchmark ───────────── */

{
  const b = intel.merchantBenchmark(db, "usr_nafiztong", NOW);
  // The dataset has 5 merchants, so peers are "all other merchants" (at most 4).
  check("benchmark: compared with other merchants", b.peerCount >= 2, `${b.peerCount} peers, scope ${b.scope}`);
  check("benchmark: 5 metrics with percentiles 0–100", b.metrics.length === 5 && b.metrics.every((m) => m.percentile >= 0 && m.percentile <= 100 && finite(m.value) && finite(m.peerMedian)));
  const json = JSON.stringify(b);
  const leaks = db.merchantBusinesses.filter((x) => x.userId !== "usr_nafiztong" && (json.includes(x.userId) || json.includes(x.merchantId) || json.includes(x.businessName)));
  check("benchmark: reveals no other merchant", leaks.length === 0, leaks.length ? `leaked ${leaks.length}` : "");
  const sparse = db.merchantBusinesses.find((x) => x.district === "Gazipur");
  const gb = intel.merchantBenchmark(db, sparse.userId, NOW);
  check("benchmark: falls back when a district has too few peers", gb.scope !== "CATEGORY_DISTRICT", `Gazipur shop → ${gb.scope}`);
}

/* ───────────── anomalies ───────────── */

{
  const list = intel.agentIntelligence(db, NOW);
  const byId = new Map(list.map((a) => [a.userId, a]));
  check("anomalies: near-limit agent flagged", byId.get(S.nearLimit)?.flags.some((f) => f.code === "NEAR_LIMIT_CASH_OUTS"), JSON.stringify(byId.get(S.nearLimit)?.flags.map((f) => f.code)));
  check("anomalies: repeated-customer pattern flagged", [S.nearLimit, S.offHours].some((id) => byId.get(id)?.flags.some((f) => f.code === "REPEATED_CUSTOMER")));
  check("anomalies: off-hours agent flagged", byId.get(S.offHours)?.flags.some((f) => f.code === "OFF_HOURS_ACTIVITY"), JSON.stringify(byId.get(S.offHours)?.flags.map((f) => f.code)));
  check("anomalies: the fast-growing agent is a rising performer", S.rising.every((id) => byId.get(id)?.rising), S.rising.map((id) => `txns ${byId.get(id)?.transactionsGrowthPct}%, volume ${byId.get(id)?.growthPct}%`).join("; "));
  const risingOthers = list.filter((a) => a.rising && !S.rising.includes(a.userId));
  check("anomalies: few other agents count as rising", risingOthers.length <= 2, risingOthers.map((a) => `${a.outletName} +${a.transactionsGrowthPct}%`).join(", "));
  check("anomalies: Gazipur agent shows a service gap", !!byId.get(S.serviceGap)?.serviceGap, JSON.stringify(byId.get(S.serviceGap)?.serviceGap));
  const planted = new Set([S.nearLimit, S.offHours]);
  const falseFlags = list.filter((a) => !planted.has(a.userId) && a.flags.some((f) => f.code !== "VOLUME_SPIKE"));
  check("anomalies: ordinary agents are not flagged", falseFlags.length <= 1, falseFlags.map((a) => `${a.outletName}: ${a.flags.map((f) => f.code)}`).join("; "));
  const perf = intel.agentPerformance(db, "usr_sabbir_tele", NOW);
  check("performance: own metrics with an anonymous rank", perf.weekly.length === 8 && perf.rank.peers > 0 && perf.rank.percentile >= 0 && perf.rank.percentile <= 100, `p${perf.rank.percentile} of ${perf.rank.peers} (${perf.rank.scope})`);
}

/* ───────────── coverage ───────────── */

{
  const cov = intel.locationCoverage(db, NOW);
  check("coverage: all 4 districts ranked", cov.length === 4 && cov.every((c, i) => c.rank === i + 1));
  check("coverage: Gazipur is the most underserved district", cov[0].district === "Gazipur", cov.slice(0, 3).map((c) => `${c.district} ${c.underservedScore}`).join(", "));
  check("coverage: Gazipur needs more agents", cov[0].agentsNeeded > 0, `${cov[0].agentsNeeded} more agents`);
}

summary();
