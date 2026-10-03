import type { AgentLiquidity, LiquidityDay, LiquiditySuggestion, SeriesForecast } from "@/types/domain";
import { walletOf } from "../ledger";
import { RATES } from "../policy";
import type { DbState, TransactionRecord } from "../schema";
import {
  DAY_MS,
  dailyTotals,
  dayLabel,
  dayStartMs,
  dhakaDay,
  dhakaHour,
  isoDate,
  median,
  succeeded,
  sum,
  ts,
  txnsByUser,
} from "./common";
import { forecastSeries } from "./forecast";

/**
 * Agent liquidity: forecast cash-outs, cash-ins and other cash collected
 * (recharge, bill payments), then project the outlet's cash in hand and
 * e-money float day by day from the current wallet. A day is "at risk" when a
 * busy day (upper forecast band) would need more than the projected opening
 * balance. Suggested amounts round up to the next ৳1,000.
 */

const ROUND_TO = 100_000; // ৳1,000 in poisha
const ceilTo = (v: number) => Math.ceil(v / ROUND_TO) * ROUND_TO;
const floorTo = (v: number) => Math.floor(v / ROUND_TO) * ROUND_TO;

/** Effect of one transaction on the agent's e-money float and cash in hand (same rules as ledger.post). */
export function agentEffect(t: TransactionRecord, agentId: string) {
  let float = 0;
  let cash = 0;
  if (succeeded(t)) {
    if (t.sender.userId === agentId) float -= t.amount + t.senderFee;
    if (t.receiver.userId === agentId) float += t.amount - t.receiverFee;
    if (t.commission?.userId === agentId) float += t.commission.amount;
  } else if (t.status === "PENDING" && t.sender.userId === agentId) {
    float -= t.amount + t.senderFee; // held in pending until it clears
  }
  if ((succeeded(t) || t.status === "PENDING") && t.cashEffect?.userId === agentId) cash += t.cashEffect.delta;
  return { float, cash };
}

/** Daily cash-out / cash-in / other cash collected for an agent (successful only), oldest first. */
export function agentFlows(txns: TransactionRecord[], agentId: string, fromDay: number, toDay: number) {
  const items = (pick: (t: TransactionRecord) => boolean) =>
    txns.filter((t) => succeeded(t) && pick(t)).map((t) => ({ day: dhakaDay(ts(t)), value: t.amount }));
  return {
    cashOut: dailyTotals(items((t) => t.type === "CASH_OUT" && t.receiver.userId === agentId), fromDay, toDay),
    cashIn: dailyTotals(items((t) => t.type === "CASH_IN" && t.sender.userId === agentId), fromDay, toDay),
    other: dailyTotals(items((t) => (t.type === "MOBILE_RECHARGE" || t.type === "BILL_PAYMENT") && t.sender.userId === agentId), fromDay, toDay),
  };
}

/** End-of-day float and cash for the given days, walking back from the current wallet. */
export function reconstructBalances(db: DbState, agentId: string, days: number[]) {
  const w = walletOf(db, agentId);
  const txns = [...(txnsByUser(db).get(agentId) ?? [])].sort((a, b) => ts(b) - ts(a)); // newest first
  const out = new Map<number, { cash: number; float: number }>();
  let cash = w.cashInHand ?? 0;
  let float = w.available;
  let i = 0;
  for (const day of [...days].sort((a, b) => b - a)) {
    const end = dayStartMs(day + 1);
    while (i < txns.length && ts(txns[i]) >= end) {
      const e = agentEffect(txns[i], agentId);
      cash -= e.cash;
      float -= e.float;
      i++;
    }
    out.set(day, { cash, float });
  }
  return out;
}

/** Days in the last 30 that ended with under a quarter of a typical day's cash-outs, or that turned cash-outs away. */
export function lowCashDays(db: DbState, agentId: string, now = Date.now()) {
  const today = dhakaDay(now);
  const days = Array.from({ length: 30 }, (_, k) => today - 30 + k);
  const txns = txnsByUser(db).get(agentId) ?? [];
  const { cashOut } = agentFlows(txns, agentId, today - 30, today - 1);
  const typical = median(cashOut.filter((v) => v > 0));
  const balances = reconstructBalances(db, agentId, days);
  const failedDays = new Set(txns.filter((t) => t.type === "CASH_OUT" && t.status === "FAILED" && t.receiver.userId === agentId).map((t) => dhakaDay(ts(t))));
  return days.filter((d) => failedDays.has(d) || (typical > 0 && (balances.get(d)?.cash ?? 0) < typical * 0.25)).length;
}

export function agentLiquidity(db: DbState, agentId: string, now = Date.now()): AgentLiquidity {
  const today = dhakaDay(now);
  const w = walletOf(db, agentId);
  const txns = txnsByUser(db).get(agentId) ?? [];
  const from = today - 56;
  const flows = agentFlows(txns, agentId, from, today - 1);
  const cashOutForecast = forecastSeries(flows.cashOut, today, { monthStart: true, money: true });
  const cashInForecast = forecastSeries(flows.cashIn, today, { monthStart: true, money: true });
  const otherForecast: SeriesForecast = forecastSeries(flows.other, today, { money: true });

  // Commission on "other" (recharge, bills) at the agent's observed rate; cash in/out at the published rates.
  const recentOther = txns.filter((t) => succeeded(t) && (t.type === "MOBILE_RECHARGE" || t.type === "BILL_PAYMENT") && t.sender.userId === agentId && ts(t) >= now - 30 * DAY_MS);
  const otherVolume = sum(recentOther.map((t) => t.amount));
  const otherRate = otherVolume ? sum(recentOther.map((t) => t.commission?.amount ?? 0)) / otherVolume : 0;

  // How much of today's usual activity is still ahead (from the agent's hour-of-day profile).
  const recent = txns.filter((t) => ts(t) >= now - 30 * DAY_MS && ts(t) < dayStartMs(today));
  const hourNow = dhakaHour(now);
  const remainingToday = recent.length >= 10 ? recent.filter((t) => dhakaHour(ts(t)) >= hourNow).length / recent.length : Math.max(0, (22 - hourNow) / 14);

  let cash = w.cashInHand ?? 0;
  let float = w.available;
  const projected = cashOutForecast.points.map((p, h) => {
    const share = h === 0 ? Math.min(1, remainingToday) : 1;
    const scale = (v: number) => Math.round(v * share);
    const cashOut = scale(p.value);
    const cashIn = scale(cashInForecast.points[h].value);
    const otherCashIn = scale(otherForecast.points[h].value);
    const commission = Math.round(cashOut * RATES.cashOutAgentCommission + cashIn * RATES.cashInAgentCommission + otherCashIn * otherRate);
    const openingCash = cash;
    const openingFloat = float;
    cash = openingCash + cashIn + otherCashIn - cashOut;
    float = openingFloat - cashIn - otherCashIn + cashOut + commission;
    // What a busy day (upper band) would ask of the counter.
    const busyCashOut = scale(p.high);
    const busyFloatNeed = scale(cashInForecast.points[h].high + otherForecast.points[h].high);
    const day: LiquidityDay = {
      date: p.date,
      label: p.label,
      cashIn,
      cashOut,
      otherCashIn,
      commission,
      openingCash,
      closingCash: cash,
      openingFloat,
      closingFloat: float,
      cashAtRisk: busyCashOut > 0 && openingCash < busyCashOut,
      floatAtRisk: busyFloatNeed > 0 && openingFloat < busyFloatNeed,
    };
    return { day, busyCashOut, busyFloatNeed };
  });
  const days = projected.map((x) => x.day);

  const risky = projected.find((x) => x.day.cashAtRisk || x.day.floatAtRisk);
  const shortfall = risky
    ? risky.day.cashAtRisk
      ? { kind: "CASH" as const, date: risky.day.date, label: risky.day.label, opening: risky.day.openingCash, demand: risky.busyCashOut }
      : { kind: "FLOAT" as const, date: risky.day.date, label: risky.day.label, opening: risky.day.openingFloat, demand: risky.busyFloatNeed }
    : null;

  // Suggestions cover the worst projected gap of the week. A float top-up moves
  // outlet cash into e-money, so any cash it uses beyond the spare cash must be brought in.
  const suggestions: LiquiditySuggestion[] = [];
  const firstDate = (pick: (d: LiquidityDay) => boolean) => days.find(pick)?.date ?? days[0].date;
  const floatGap = Math.max(0, ...projected.map((x) => x.busyFloatNeed - x.day.openingFloat));
  const topUp = floatGap > 0 ? ceilTo(floatGap) : 0;
  if (topUp) suggestions.push({ kind: "FLOAT_TOP_UP", amount: topUp, byDate: firstDate((d) => d.floatAtRisk) });
  const cashSlack = Math.min(...projected.map((x) => x.day.openingCash - x.busyCashOut));
  const bringCash = Math.max(0, topUp - cashSlack);
  if (bringCash > 0) suggestions.push({ kind: "ADD_CASH", amount: ceilTo(bringCash), byDate: firstDate((d) => d.cashAtRisk || d.floatAtRisk) });
  const maxFloatNeed = Math.max(0, ...projected.map((x) => x.busyFloatNeed));
  const surplus = floorTo(Math.min(...days.map((d) => d.openingFloat)) - 2 * maxFloatNeed);
  if (!topUp && maxFloatNeed > 0 && surplus >= 500_000) suggestions.push({ kind: "SETTLE_TO_BANK", amount: surplus, byDate: days[days.length - 1].date });

  const historyDays = Array.from({ length: 14 }, (_, k) => today - 14 + k);
  const balances = reconstructBalances(db, agentId, historyDays);

  return {
    asOf: new Date(now).toISOString(),
    cashInHand: w.cashInHand ?? 0,
    float: w.available,
    days,
    shortfall,
    suggestions,
    history: historyDays.map((d) => ({ date: isoDate(d), label: dayLabel(d), cash: balances.get(d)!.cash, float: balances.get(d)!.float })),
    lowCashDays30: lowCashDays(db, agentId, now),
    cashOutForecast,
    cashInForecast,
  };
}
