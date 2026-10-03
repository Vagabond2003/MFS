import type { BenchmarkMetric, BusinessCategory, MerchantBenchmark } from "@/types/domain";
import { ApiError } from "../../errors";
import type { DbState } from "../schema";
import { DAY_MS, median, percentileRank, round3, succeeded, ts, txnsByUser } from "./common";

/**
 * A merchant against its peers over the last 30 days. Peers are verified
 * merchants with at least 5 successful payments in the window: same category
 * and district when there are 5 or more of them, otherwise same category,
 * otherwise all merchants. Only medians and percentiles leave this function —
 * never another merchant's identity or individual figures.
 */

export const BENCHMARK_WINDOW_DAYS = 30;
const MIN_PEERS = 5;
const MIN_PAYMENTS = 5;

type Metrics = Record<BenchmarkMetric, number> & { payments: number };

const HIGHER_IS_BETTER: Record<BenchmarkMetric, boolean> = {
  revenue: true,
  avgTicket: true,
  repeatRate: true,
  qrShare: true,
  failureRate: false,
};
const ORDER: BenchmarkMetric[] = ["revenue", "avgTicket", "repeatRate", "qrShare", "failureRate"];

function merchantMetrics(db: DbState, merchantUserId: string, now: number): Metrics {
  const since = now - BENCHMARK_WINDOW_DAYS * DAY_MS;
  const attempts = (txnsByUser(db).get(merchantUserId) ?? []).filter(
    (t) => t.type === "MERCHANT_PAYMENT" && t.receiver.userId === merchantUserId && ts(t) >= since && ts(t) <= now,
  );
  const good = attempts.filter(succeeded);
  const revenue = good.reduce((s, t) => s + t.amount, 0);
  const perCustomer = new Map<string, number>();
  for (const t of good) if (t.sender.userId) perCustomer.set(t.sender.userId, (perCustomer.get(t.sender.userId) ?? 0) + 1);
  const repeaters = [...perCustomer.values()].filter((n) => n >= 2).length;
  return {
    payments: good.length,
    revenue,
    avgTicket: good.length ? Math.round(revenue / good.length) : 0,
    repeatRate: perCustomer.size ? round3(repeaters / perCustomer.size) : 0,
    qrShare: good.length ? round3(good.filter((t) => t.paymentMethod === "QR_SCAN").length / good.length) : 0,
    failureRate: attempts.length ? round3(attempts.filter((t) => t.status === "FAILED").length / attempts.length) : 0,
  };
}

export function merchantBenchmark(db: DbState, merchantUserId: string, now = Date.now()): MerchantBenchmark {
  const own = db.merchantBusinesses.find((b) => b.userId === merchantUserId);
  if (!own) throw new ApiError("NOT_FOUND", "Business profile not found.");
  const category = own.category as BusinessCategory;
  const district = own.district ?? null;

  const verified = new Set(db.users.filter((u) => u.role === "MERCHANT" && u.status === "VERIFIED").map((u) => u.id));
  const candidates = db.merchantBusinesses
    .filter((b) => b.userId !== merchantUserId && verified.has(b.userId))
    .map((b) => ({ b, m: merchantMetrics(db, b.userId, now) }))
    .filter(({ m }) => m.payments >= MIN_PAYMENTS);

  const sameCategory = candidates.filter(({ b }) => b.category === category);
  const sameDistrict = district ? sameCategory.filter(({ b }) => b.district === district) : [];
  const [scope, peers] =
    sameDistrict.length >= MIN_PEERS
      ? (["CATEGORY_DISTRICT", sameDistrict] as const)
      : sameCategory.length >= MIN_PEERS
        ? (["CATEGORY", sameCategory] as const)
        : (["ALL", candidates] as const);

  const mine = merchantMetrics(db, merchantUserId, now);
  return {
    asOf: new Date(now).toISOString(),
    windowDays: BENCHMARK_WINDOW_DAYS,
    scope,
    peerCount: peers.length,
    category,
    district,
    metrics: ORDER.map((key) => {
      const values = peers.map(({ m }) => m[key]);
      const peerMedian = median(values);
      return {
        key,
        value: mine[key],
        peerMedian: key === "revenue" || key === "avgTicket" ? Math.round(peerMedian) : round3(peerMedian),
        percentile: percentileRank(mine[key], values, HIGHER_IS_BETTER[key]),
        higherIsBetter: HIGHER_IS_BETTER[key],
      };
    }),
  };
}
