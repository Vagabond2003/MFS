import type { BusinessCategory, ChurnFactor, ChurnFactorKey, MerchantChurnRisk } from "@/types/domain";
import type { DbState } from "../schema";
import { clamp, round3 } from "./common";
import { CHURN_FEATURES, churnSnapshot, hasModelHistory, type ChurnFeatureName, type ChurnSnapshot } from "./churn-features";
import { CHURN_MODEL, featureVector, scoreChurnModel } from "./churn-model";

/**
 * Merchant churn risk.
 *
 * With enough history (tenure ≥ 30 days and ≥ 5 payments in 60 days) the
 * trained model scores the merchant (churn-model.ts, trained by ml/train.py on
 * synthetic data): the score is the chance, in percent, of no successful
 * payment in the next 30 days; HIGH ≥ 50%, MEDIUM ≥ 15%. Its reasons are the
 * features that push this merchant's risk up most, shown only when the value
 * itself points to risk (so a busy merchant is never told "high volume").
 *
 * Otherwise the rule score answers, 0–100 from five named factors (points in brackets):
 *   RECENCY       days since the last successful payment     (up to 35: 0 at ≤2 days, full at 14+)
 *   COUNT_DROP    payments, last 14 days vs the 14 before    (up to 25, proportional to the drop)
 *   VALUE_DROP    revenue, same windows                      (up to 20)
 *   FAILURE_RATE  failed share of payment attempts, 30 days  (up to 10, full at 10%)
 *   REFUND_RATE   refunded share of revenue, 30 days         (up to 10, full at 10%)
 * HIGH ≥ 60, MEDIUM ≥ 35. Merchants with almost no history are left out.
 */

export const CHURN_WEIGHTS = { RECENCY: 35, COUNT_DROP: 25, VALUE_DROP: 20, FAILURE_RATE: 10, REFUND_RATE: 10 } as const;

/** The rule score and its factors for a snapshot (also the baseline the model is compared with). */
export function ruleChurnScore(s: ChurnSnapshot): { score: number; factors: ChurnFactor[] } {
  const f = s.features;
  const daysSince = s.daysSinceLastPayment ?? 30;
  const raw: ChurnFactor[] = [
    { key: "RECENCY", value: daysSince, points: CHURN_WEIGHTS.RECENCY * clamp((daysSince - 2) / 12, 0, 1) },
    { key: "COUNT_DROP", value: round3(f.count_drop), points: CHURN_WEIGHTS.COUNT_DROP * f.count_drop },
    { key: "VALUE_DROP", value: round3(f.value_drop), points: CHURN_WEIGHTS.VALUE_DROP * f.value_drop },
    { key: "FAILURE_RATE", value: round3(f.failure_rate), points: CHURN_WEIGHTS.FAILURE_RATE * clamp(f.failure_rate / 0.1, 0, 1) },
    { key: "REFUND_RATE", value: round3(f.refund_rate), points: CHURN_WEIGHTS.REFUND_RATE * clamp(f.refund_rate / 0.1, 0, 1) },
  ];
  const factors = raw
    .map((x) => ({ ...x, points: Math.round(x.points) }))
    .filter((x) => x.points > 0)
    .sort((a, b) => b.points - a.points);
  return { score: clamp(factors.reduce((t, x) => t + x.points, 0), 0, 100), factors };
}

/**
 * Model reasons. Each reason groups features (the two activity measures move
 * together, so they are read as one) and says when its value points to risk.
 */
const REASONS: { key: ChurnFactorKey; features: ChurnFeatureName[]; value: (s: ChurnSnapshot) => number; risky: (v: number) => boolean }[] = [
  { key: "RECENCY", features: ["days_since_last"], value: (s) => s.daysSinceLastPayment ?? 60, risky: (v) => v >= 3 },
  { key: "COUNT_DROP", features: ["count_drop"], value: (s) => round3(s.features.count_drop), risky: (v) => v > 0 },
  { key: "VALUE_DROP", features: ["value_drop"], value: (s) => round3(s.features.value_drop), risky: (v) => v > 0 },
  { key: "FAILURE_RATE", features: ["failure_rate"], value: (s) => round3(s.features.failure_rate), risky: (v) => v > 0 },
  { key: "REFUND_RATE", features: ["refund_rate"], value: (s) => round3(s.features.refund_rate), risky: (v) => v > 0 },
  { key: "TENURE", features: ["tenure_days"], value: (s) => s.tenureDays, risky: (v) => v < 90 },
  { key: "TREND", features: ["trend_8w"], value: (s) => round3(s.features.trend_8w), risky: (v) => v < 0 },
  { key: "CONCENTRATION", features: ["top_customer_share"], value: (s) => round3(s.features.top_customer_share), risky: (v) => v >= 0.3 },
  { key: "REPEAT_SHARE", features: ["repeat_share"], value: (s) => round3(s.features.repeat_share), risky: (v) => v < 0.5 },
  { key: "ACTIVITY", features: ["log_payments_60", "active_days_28"], value: (s) => round3(s.features.active_days_28), risky: (v) => v < 0.5 },
];

export function modelChurnScore(s: ChurnSnapshot): { probability: number; factors: ChurnFactor[] } {
  const { probability, contributions } = scoreChurnModel(CHURN_MODEL, featureVector(s.features));
  const byFeature = Object.fromEntries(CHURN_FEATURES.map((f, i) => [f, contributions[i]])) as Record<ChurnFeatureName, number>;
  const pushing = REASONS.map((r) => ({ r, value: r.value(s), push: r.features.reduce((t, f) => t + byFeature[f], 0) })).filter((x) => x.push > 0 && x.r.risky(x.value));
  const total = pushing.reduce((t, x) => t + x.push, 0);
  const factors = pushing
    .map((x) => ({ key: x.r.key, value: x.value, points: Math.round((100 * x.push) / total) }))
    .filter((f) => f.points > 0)
    .sort((a, b) => b.points - a.points);
  return { probability, factors };
}

export function merchantChurnRisk(db: DbState, merchantUserId: string, now = Date.now()): MerchantChurnRisk | null {
  const biz = db.merchantBusinesses.find((b) => b.userId === merchantUserId);
  const s = biz ? churnSnapshot(db, merchantUserId, now) : null;
  // "Almost no history" means over the merchant's whole record, not the last 28 days:
  // a merchant whose payments have all but stopped is the riskiest one, not one to leave out.
  if (!biz || !s || s.totalPayments < 3) return null;
  let scored: Pick<MerchantChurnRisk, "score" | "level" | "method" | "probability" | "factors">;
  if (hasModelHistory(s)) {
    const { probability, factors } = modelChurnScore(s);
    const t = CHURN_MODEL.thresholds;
    scored = { score: Math.round(probability * 100), level: probability >= t.high ? "HIGH" : probability >= t.medium ? "MEDIUM" : "LOW", method: "MODEL", probability, factors };
  } else {
    const { score, factors } = ruleChurnScore(s);
    scored = { score, level: score >= 60 ? "HIGH" : score >= 35 ? "MEDIUM" : "LOW", method: "RULES", probability: null, factors };
  }
  return {
    userId: merchantUserId,
    merchantId: biz.merchantId,
    businessName: biz.businessName,
    category: biz.category as BusinessCategory,
    district: biz.district ?? null,
    ...scored,
    daysSinceLastPayment: s.daysSinceLastPayment,
    count14: s.count14,
    prevCount14: s.prevCount14,
    value14: s.value14,
    prevValue14: s.prevValue14,
  };
}

const LEVEL_RANK = { HIGH: 2, MEDIUM: 1, LOW: 0 } as const;

/**
 * All verified merchants with enough history, riskiest first: by level, then
 * score (model percentages and rule points are different scales, so the level decides first).
 */
export function churnRanking(db: DbState, now = Date.now()) {
  return db.users
    .filter((u) => u.role === "MERCHANT" && u.status === "VERIFIED")
    .map((u) => merchantChurnRisk(db, u.id, now))
    .filter((r): r is MerchantChurnRisk => r !== null)
    .sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || b.score - a.score || a.merchantId.localeCompare(b.merchantId));
}
