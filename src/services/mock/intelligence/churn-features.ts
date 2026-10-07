import type { DbState, TransactionRecord } from "../schema";
import { DAY_MS, clamp, dhakaDay, succeeded, sum, ts, txnsByUser } from "./common";

/**
 * Churn features for one merchant at one moment, from payments strictly
 * before `now`. The same function builds the training table
 * (scripts/churn-dataset.mjs) and scores merchants in the app, so the model
 * sees exactly the features it was trained on.
 *
 *   days_since_last      days since the last successful payment (capped at 60)
 *   count_drop           payments, last 14 days vs the 14 before: 0 = no drop, 1 = none left
 *   value_drop           the same for payment value
 *   failure_rate         failed share of payment attempts, last 30 days
 *   refund_rate          refunded share of revenue, last 30 days (capped at 1)
 *   tenure_days          days since the account was created (capped at 365)
 *   trend_8w             weekly payment counts over 8 weeks: least-squares slope ÷ mean, per week, in [-1, 1]
 *   top_customer_share   share of the last 60 days' payments made by the most frequent customer
 *   repeat_share         share of the last 60 days' payments made by customers who paid 2+ times
 *   log_payments_60      ln(1 + payments in the last 60 days)
 *   active_days_28       share of the last 28 days with at least one payment
 *
 * The first five are the rule score's factors (churn.ts).
 */

export const CHURN_FEATURES = [
  "days_since_last",
  "count_drop",
  "value_drop",
  "failure_rate",
  "refund_rate",
  "tenure_days",
  "trend_8w",
  "top_customer_share",
  "repeat_share",
  "log_payments_60",
  "active_days_28",
] as const;

export type ChurnFeatureName = (typeof CHURN_FEATURES)[number];
export type ChurnFeatures = Record<ChurnFeatureName, number>;

export interface ChurnSnapshot {
  features: ChurnFeatures;
  /** Uncapped; null when the merchant has never been paid. */
  daysSinceLastPayment: number | null;
  count14: number;
  prevCount14: number;
  value14: number;
  prevValue14: number;
  /** Successful payments ever (before `now`), and in the last 60 days. */
  totalPayments: number;
  payments60: number;
  tenureDays: number;
}

/** Below this the model isn't used and the rule score answers (thin history). */
export const MODEL_MIN_TENURE_DAYS = 30;
export const MODEL_MIN_PAYMENTS_60 = 5;
export const hasModelHistory = (s: ChurnSnapshot) => s.tenureDays >= MODEL_MIN_TENURE_DAYS && s.payments60 >= MODEL_MIN_PAYMENTS_60;

const drop = (cur: number, prev: number) => (prev > 0 ? clamp(1 - cur / prev, 0, 1) : 0);

export function churnSnapshot(db: DbState, merchantUserId: string, now: number): ChurnSnapshot | null {
  const user = db.users.find((u) => u.id === merchantUserId && u.role === "MERCHANT");
  if (!user) return null;
  const txns = (txnsByUser(db).get(merchantUserId) ?? []).filter((t) => ts(t) < now);
  const payments = txns.filter((t) => t.type === "MERCHANT_PAYMENT" && t.receiver.userId === merchantUserId);
  const good = payments.filter(succeeded);
  const since = (days: number) => now - days * DAY_MS;
  const within = (t: TransactionRecord, fromDaysAgo: number, toDaysAgo = 0) => ts(t) >= since(fromDaysAgo) && ts(t) < since(toDaysAgo);

  const last14 = good.filter((t) => within(t, 14));
  const prev14 = good.filter((t) => within(t, 28, 14));
  const lastPayment = good.reduce((m, t) => Math.max(m, ts(t)), 0);
  const daysSince = lastPayment ? Math.floor((now - lastPayment) / DAY_MS) : null;
  const value14 = sum(last14.map((t) => t.amount));
  const prevValue14 = sum(prev14.map((t) => t.amount));

  const attempts30 = payments.filter((t) => within(t, 30));
  const failureRate = attempts30.length ? attempts30.filter((t) => t.status === "FAILED").length / attempts30.length : 0;
  const revenue30 = sum(good.filter((t) => within(t, 30)).map((t) => t.amount));
  const refunded30 = sum(txns.filter((t) => t.type === "REFUND" && t.sender.userId === merchantUserId && t.status === "SUCCESSFUL" && within(t, 30)).map((t) => t.amount));

  const last60 = good.filter((t) => within(t, 60));
  const byCustomer = new Map<string, number>();
  for (const t of last60) {
    const key = t.sender.userId ?? t.sender.account;
    byCustomer.set(key, (byCustomer.get(key) ?? 0) + 1);
  }
  const counts = [...byCustomer.values()];
  const topShare = last60.length ? Math.max(...counts) / last60.length : 0;
  const repeatShare = last60.length ? sum(counts.filter((n) => n >= 2)) / last60.length : 0;

  const weeks = Array.from({ length: 8 }, (_, k) => good.filter((t) => within(t, (8 - k) * 7, (7 - k) * 7)).length);
  const meanWeek = sum(weeks) / 8;
  // Least-squares slope over x = 0..7 (mean 3.5, Σ(x − 3.5)² = 42).
  const slope = sum(weeks.map((w, x) => (x - 3.5) * (w - meanWeek))) / 42;
  const trend = meanWeek > 0 ? clamp(slope / meanWeek, -1, 1) : 0;

  const activeDays = new Set(good.filter((t) => within(t, 28)).map((t) => dhakaDay(ts(t)))).size;
  const tenureDays = Math.max(0, Math.floor((now - Date.parse(user.createdAt)) / DAY_MS));

  return {
    features: {
      days_since_last: Math.min(60, daysSince ?? 60),
      count_drop: drop(last14.length, prev14.length),
      value_drop: drop(value14, prevValue14),
      failure_rate: failureRate,
      refund_rate: revenue30 ? Math.min(1, refunded30 / revenue30) : 0,
      tenure_days: Math.min(365, tenureDays),
      trend_8w: trend,
      top_customer_share: topShare,
      repeat_share: repeatShare,
      log_payments_60: Math.log1p(last60.length),
      active_days_28: activeDays / 28,
    },
    daysSinceLastPayment: daysSince,
    count14: last14.length,
    prevCount14: prev14.length,
    value14,
    prevValue14,
    totalPayments: good.length,
    payments60: last60.length,
    tenureDays,
  };
}
