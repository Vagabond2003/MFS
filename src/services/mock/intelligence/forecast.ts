import type { ForecastPoint, MerchantDemand, PaymentMethod, SeriesForecast } from "@/types/domain";
import type { DbState } from "../schema";
import {
  clamp,
  dailyTotals,
  dayLabel,
  dhakaDay,
  dhakaHour,
  isMonthStart,
  isoDate,
  mean,
  round1,
  round3,
  succeeded,
  sum,
  ts,
  weekday,
} from "./common";

/**
 * Daily forecast = trend level × day-of-week index × (start-of-month uplift on days 1–5).
 *
 * - The day-of-week index is learned from the last 8 weeks (shrunk towards 1
 *   when a weekday has few observations).
 * - The uplift compares de-seasonalised days 1–5 with the rest of the month.
 * - The trend is a least-squares slope over the last 28 de-seasonalised days,
 *   damped by half when projected forward and never below zero.
 * - The band (~80%) is ±1.28 × the in-sample residual spread, widening slowly.
 */

const HISTORY_DAYS = 56;
const TREND_DAYS = 28;
const DAMPING = 0.5;
const Z80 = 1.28;

/**
 * @param history  daily values, oldest first; the last value is yesterday (complete days only)
 * @param today    Dhaka day number of today (the first forecast point)
 */
export function forecastSeries(history: number[], today: number, opts: { horizon?: number; monthStart?: boolean; money?: boolean } = {}): SeriesForecast {
  const horizon = opts.horizon ?? 7;
  const values = history.slice(-HISTORY_DAYS);
  const n = values.length;
  const firstDay = today - n;
  const dayOf = (i: number) => firstDay + i;
  const fmt = (v: number) => (opts.money ? Math.round(v) : round1(v));

  // Day-of-week index, from days outside the month-start window when that window is modelled separately.
  const regular = values.map((v, i) => ({ v, d: dayOf(i) })).filter(({ d }) => !(opts.monthStart && isMonthStart(d)));
  const overall = mean(regular.map((x) => x.v));
  const weekdayIndex = Array.from({ length: 7 }, (_, w) => {
    const obs = regular.filter((x) => weekday(x.d) === w).map((x) => x.v);
    if (!obs.length || overall <= 0) return 1;
    const raw = mean(obs) / overall;
    const weight = obs.length / (obs.length + 2);
    return round3(clamp(1 + (raw - 1) * weight, 0.2, 3));
  });
  const season = (d: number, uplift: number | null) => weekdayIndex[weekday(d)] * (uplift && isMonthStart(d) ? uplift : 1);

  let monthStartUplift: number | null = null;
  if (opts.monthStart) {
    const ds = values.map((v, i) => ({ v: v / weekdayIndex[weekday(dayOf(i))], d: dayOf(i) }));
    const start = ds.filter((x) => isMonthStart(x.d)).map((x) => x.v);
    const rest = ds.filter((x) => !isMonthStart(x.d)).map((x) => x.v);
    if (start.length >= 4 && mean(rest) > 0) monthStartUplift = round3(clamp(mean(start) / mean(rest), 0.6, 3));
  }

  // Trend on the de-seasonalised recent window.
  const window = values.slice(-TREND_DAYS).map((v, k) => {
    const i = n - Math.min(n, TREND_DAYS) + k;
    return v / season(dayOf(i), monthStartUplift);
  });
  const m = window.length;
  const xs = window.map((_, k) => k);
  const xBar = mean(xs);
  const yBar = mean(window);
  const sxx = sum(xs.map((x) => (x - xBar) ** 2));
  const slope = sxx > 0 ? sum(xs.map((x, k) => (x - xBar) * (window[k] - yBar))) / sxx : 0;
  const level = Math.max(0, yBar + slope * (m - 1 - xBar)); // fitted value for yesterday
  const trendPerWeekPct = level > 0 ? round1(((slope * 7) / level) * 100) : 0;

  // Residual spread of the fitted model over the same window.
  const fitted = window.map((_, k) => Math.max(0, yBar + slope * (k - xBar)) * season(dayOf(n - m + k), monthStartUplift));
  const actual = values.slice(-m);
  const sigma = m > 1 ? Math.sqrt(mean(actual.map((a, k) => (a - fitted[k]) ** 2))) : 0;

  const points: ForecastPoint[] = Array.from({ length: horizon + 1 }, (_, h) => {
    const d = today + h;
    const base = Math.max(0, level + slope * (h + 1) * DAMPING);
    const value = base * season(d, monthStartUplift);
    const spread = Z80 * sigma * (1 + 0.05 * h);
    return { date: isoDate(d), label: dayLabel(d), value: fmt(value), low: fmt(Math.max(0, value - spread)), high: fmt(value + spread) };
  });

  return { points, weekdayIndex, monthStartUplift, trendPerWeekPct, historyDays: n };
}

/* ───────────── Merchant demand ───────────── */

export function merchantDemand(db: DbState, merchantUserId: string, now = Date.now()): MerchantDemand {
  const today = dhakaDay(now);
  const payments = db.transactions.filter((t) => t.type === "MERCHANT_PAYMENT" && t.receiver.userId === merchantUserId);
  const good = payments.filter(succeeded).map((t) => ({ t, day: dhakaDay(ts(t)) }));

  const from = today - HISTORY_DAYS;
  const revenue = dailyTotals(good.map(({ t, day }) => ({ day, value: t.amount })), from, today - 1);
  const count = dailyTotals(good.map(({ day }) => ({ day, value: 1 })), from, today - 1);

  const revenueForecast = forecastSeries(revenue, today, { monthStart: true, money: true });
  const countForecast = forecastSeries(count, today, { monthStart: true });

  const actual = Array.from({ length: 28 }, (_, k) => {
    const day = today - 28 + k;
    return { date: isoDate(day), label: dayLabel(day), revenue: revenue[day - from], count: count[day - from] };
  });

  // Hour-of-day profile and mix over the last 30 days.
  const recent = good.filter(({ day }) => day >= today - 30 && day < today);
  const hours = Array.from({ length: 24 }, (_, hour) => {
    const inHour = recent.filter(({ t }) => dhakaHour(ts(t)) === hour);
    return { hour, count: round1(inHour.length / 30), revenue: Math.round(sum(inHour.map(({ t }) => t.amount)) / 30) };
  });
  const busiestHours = [...hours].filter((h) => h.count > 0).sort((a, b) => b.count - a.count || a.hour - b.hour).slice(0, 3).map((h) => h.hour);
  const idx = revenueForecast.weekdayIndex;
  const busiestWeekday = recent.length >= 10 ? idx.indexOf(Math.max(...idx)) : null;

  const total = sum(recent.map(({ t }) => t.amount));
  const methods = new Map<PaymentMethod, number>();
  for (const { t } of recent) if (t.paymentMethod) methods.set(t.paymentMethod, (methods.get(t.paymentMethod) ?? 0) + t.amount);
  // Repeat = the customer had already paid this merchant within the previous 90 days.
  const seenBefore = (customerId: string | null, at: number) =>
    !!customerId && good.some(({ t }) => t.sender.userId === customerId && ts(t) < at && ts(t) >= at - 90 * 86_400_000);
  const repeatValue = sum(recent.filter(({ t }) => seenBefore(t.sender.userId, ts(t))).map(({ t }) => t.amount));

  const next = revenueForecast.points.slice(1);
  return {
    asOf: new Date(now).toISOString(),
    actual,
    revenueForecast,
    countForecast,
    hours,
    busiestHours,
    busiestWeekday,
    breakdown: {
      method: [...methods.entries()].map(([method, value]) => ({ method, share: total ? round3(value / total) : 0 })).sort((a, b) => b.share - a.share),
      repeatShare: total ? round3(repeatValue / total) : 0,
      newShare: total ? round3(1 - repeatValue / total) : 0,
    },
    nextWeek: { value: sum(next.map((p) => p.value)), low: sum(next.map((p) => p.low)), high: sum(next.map((p) => p.high)) },
  };
}
