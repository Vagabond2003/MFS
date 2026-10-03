import type { DbState, TransactionRecord } from "../schema";

/**
 * Shared helpers for the intelligence functions. Days and hours are bucketed
 * in Asia/Dhaka (UTC+6, no daylight saving) so results don't depend on the
 * server's time zone.
 */

export const DAY_MS = 86_400_000;
const DHAKA_OFFSET_MS = 6 * 3_600_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Dhaka calendar day number (days since 1970-01-01, Dhaka). */
export const dhakaDay = (ms: number) => Math.floor((ms + DHAKA_OFFSET_MS) / DAY_MS);
export const dhakaHour = (ms: number) => Math.floor((((ms + DHAKA_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS / 3_600_000);
/** 0 = Sunday … 6 = Saturday. */
export const weekday = (day: number) => new Date(day * DAY_MS).getUTCDay();
export const dayOfMonth = (day: number) => new Date(day * DAY_MS).getUTCDate();
export const isMonthStart = (day: number) => dayOfMonth(day) <= 5;
export const isoDate = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
export const dayLabel = (day: number) => {
  const d = new Date(day * DAY_MS);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
/** Start of a Dhaka day, as a UTC timestamp. */
export const dayStartMs = (day: number) => day * DAY_MS - DHAKA_OFFSET_MS;

export const ts = (t: TransactionRecord) => Date.parse(t.createdAt);
/** Completed for money purposes (a refunded payment still happened). */
export const succeeded = (t: TransactionRecord) => t.status === "SUCCESSFUL" || t.status === "REFUNDED";

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
export const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
export const round1 = (v: number) => Math.round(v * 10) / 10;
export const round3 = (v: number) => Math.round(v * 1000) / 1000;

export function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Share of peers this value beats (ties count half), 0–100. */
export function percentileRank(value: number, peers: number[], higherIsBetter = true) {
  if (!peers.length) return 50;
  let below = 0;
  let ties = 0;
  for (const p of peers) {
    if (p === value) ties++;
    else if (higherIsBetter ? p < value : p > value) below++;
  }
  return Math.round(((below + ties / 2) / peers.length) * 100);
}

/** Percentage change, or null when there is no base to compare with. */
export const growthPct = (current: number, previous: number) => (previous > 0 ? round1(((current - previous) / previous) * 100) : null);

/** Transactions by the users they touch (sender, receiver or commission earner). Built once per snapshot. */
const indexCache = new WeakMap<DbState, Map<string, TransactionRecord[]>>();
export function txnsByUser(db: DbState) {
  let index = indexCache.get(db);
  if (!index) {
    index = new Map();
    const add = (id: string | null | undefined, t: TransactionRecord) => {
      if (!id) return;
      const list = index!.get(id);
      if (list) {
        if (list[list.length - 1] !== t) list.push(t);
      } else index!.set(id, [t]);
    };
    for (const t of db.transactions) {
      add(t.sender.userId, t);
      add(t.receiver.userId, t);
      add(t.commission?.userId, t);
    }
    indexCache.set(db, index);
  }
  return index;
}

/** Sum of values per Dhaka day over [fromDay, toDay], oldest first. */
export function dailyTotals(items: { day: number; value: number }[], fromDay: number, toDay: number) {
  const out = new Array<number>(Math.max(0, toDay - fromDay + 1)).fill(0);
  for (const { day, value } of items) if (day >= fromDay && day <= toDay) out[day - fromDay] += value;
  return out;
}
