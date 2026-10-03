import type { BusinessCategory, ChurnFactor, MerchantChurnRisk } from "@/types/domain";
import type { DbState, TransactionRecord } from "../schema";
import { DAY_MS, clamp, round3, succeeded, sum, ts, txnsByUser } from "./common";

/**
 * Merchant churn risk, 0–100, from five named factors (points in brackets):
 *   RECENCY       days since the last successful payment     (up to 35: 0 at ≤2 days, full at 14+)
 *   COUNT_DROP    payments, last 14 days vs the 14 before    (up to 25, proportional to the drop)
 *   VALUE_DROP    revenue, same windows                      (up to 20)
 *   FAILURE_RATE  failed share of payment attempts, 30 days  (up to 10, full at 10%)
 *   REFUND_RATE   refunded share of revenue, 30 days         (up to 10, full at 10%)
 * HIGH ≥ 60, MEDIUM ≥ 35. Merchants with almost no history are left out.
 */

export const CHURN_WEIGHTS = { RECENCY: 35, COUNT_DROP: 25, VALUE_DROP: 20, FAILURE_RATE: 10, REFUND_RATE: 10 } as const;

export function merchantChurnRisk(db: DbState, merchantUserId: string, now = Date.now()): MerchantChurnRisk | null {
  const user = db.users.find((u) => u.id === merchantUserId && u.role === "MERCHANT");
  const biz = db.merchantBusinesses.find((b) => b.userId === merchantUserId);
  if (!user || !biz) return null;
  const txns = txnsByUser(db).get(merchantUserId) ?? [];
  const payments = txns.filter((t) => t.type === "MERCHANT_PAYMENT" && t.receiver.userId === merchantUserId);
  const good = payments.filter(succeeded);

  const inWindow = (t: TransactionRecord, fromDaysAgo: number, toDaysAgo: number) => {
    const x = ts(t);
    return x >= now - fromDaysAgo * DAY_MS && x < now - toDaysAgo * DAY_MS;
  };
  const last14 = good.filter((t) => inWindow(t, 14, 0));
  const prev14 = good.filter((t) => inWindow(t, 28, 14));
  if (last14.length + prev14.length < 3) return null;

  const lastPayment = good.reduce((m, t) => Math.max(m, ts(t)), 0);
  const daysSince = lastPayment ? Math.floor((now - lastPayment) / DAY_MS) : null;
  const value14 = sum(last14.map((t) => t.amount));
  const prevValue14 = sum(prev14.map((t) => t.amount));
  const attempts30 = payments.filter((t) => inWindow(t, 30, 0));
  const failureRate = attempts30.length ? attempts30.filter((t) => t.status === "FAILED").length / attempts30.length : 0;
  const revenue30 = sum(good.filter((t) => inWindow(t, 30, 0)).map((t) => t.amount));
  const refunded30 = sum(txns.filter((t) => t.type === "REFUND" && t.sender.userId === merchantUserId && t.status === "SUCCESSFUL" && inWindow(t, 30, 0)).map((t) => t.amount));
  const refundRate = revenue30 ? refunded30 / revenue30 : 0;

  const drop = (cur: number, prev: number) => (prev > 0 ? clamp(1 - cur / prev, 0, 1) : 0);
  const raw: ChurnFactor[] = [
    { key: "RECENCY", value: daysSince ?? 30, points: CHURN_WEIGHTS.RECENCY * clamp(((daysSince ?? 30) - 2) / 12, 0, 1) },
    { key: "COUNT_DROP", value: round3(drop(last14.length, prev14.length)), points: CHURN_WEIGHTS.COUNT_DROP * drop(last14.length, prev14.length) },
    { key: "VALUE_DROP", value: round3(drop(value14, prevValue14)), points: CHURN_WEIGHTS.VALUE_DROP * drop(value14, prevValue14) },
    { key: "FAILURE_RATE", value: round3(failureRate), points: CHURN_WEIGHTS.FAILURE_RATE * clamp(failureRate / 0.1, 0, 1) },
    { key: "REFUND_RATE", value: round3(refundRate), points: CHURN_WEIGHTS.REFUND_RATE * clamp(refundRate / 0.1, 0, 1) },
  ];
  const factors = raw
    .map((f) => ({ ...f, points: Math.round(f.points) }))
    .filter((f) => f.points > 0)
    .sort((a, b) => b.points - a.points);

  const score = clamp(sum(factors.map((f) => f.points)), 0, 100);
  return {
    userId: user.id,
    merchantId: biz.merchantId,
    businessName: biz.businessName,
    category: biz.category as BusinessCategory,
    district: biz.district ?? null,
    score,
    level: score >= 60 ? "HIGH" : score >= 35 ? "MEDIUM" : "LOW",
    factors,
    daysSinceLastPayment: daysSince,
    count14: last14.length,
    prevCount14: prev14.length,
    value14,
    prevValue14,
  };
}

/** All verified merchants with enough history, riskiest first. */
export function churnRanking(db: DbState, now = Date.now()) {
  return db.users
    .filter((u) => u.role === "MERCHANT" && u.status === "VERIFIED")
    .map((u) => merchantChurnRisk(db, u.id, now))
    .filter((r): r is MerchantChurnRisk => r !== null)
    .sort((a, b) => b.score - a.score || a.merchantId.localeCompare(b.merchantId));
}
