import type { MerchantBenchmark, MerchantChurnRisk, MerchantDemand, MerchantSignalCode } from "@/types/domain";
import { isMonthStart } from "./common";

/**
 * What a merchant should act on, chosen in code from the computed insights.
 * Each signal carries only the figures that justify it; the AI layer turns
 * the top three into wording, and templates do the same when no model answers.
 */

export type { MerchantSignalCode };

export interface MerchantSignal {
  code: MerchantSignalCode;
  priority: number;
  /** Raw figures (money in poisha, shares 0–1, hours 0–23). */
  data: Record<string, number | string | number[]>;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function merchantSignals(demand: MerchantDemand, benchmark: MerchantBenchmark, churn: MerchantChurnRisk | null): MerchantSignal[] {
  const signals: MerchantSignal[] = [];
  const metric = (key: string) => benchmark.metrics.find((m) => m.key === key);

  if (churn && churn.prevCount14 >= 4 && churn.count14 <= churn.prevCount14 * 0.8) {
    signals.push({ code: "WIN_BACK", priority: 100, data: { paymentsLast14: churn.count14, paymentsPrevious14: churn.prevCount14 } });
  }
  const failure = metric("failureRate");
  if (failure && failure.value >= 0.02 && failure.value > failure.peerMedian) {
    signals.push({ code: "REDUCE_FAILURES", priority: 90, data: { failureRate: failure.value, peerMedian: failure.peerMedian } });
  }
  // The next run of salary days (1st–5th) inside the forecast week, e.g. "4 Oct" to "5 Oct".
  const ahead = demand.revenueForecast.points.slice(1);
  const first = ahead.findIndex((p) => isMonthStart(Date.parse(p.date) / 86_400_000));
  const uplift = demand.revenueForecast.monthStartUplift;
  if (uplift && uplift >= 1.15 && first >= 0) {
    let last = first;
    while (last + 1 < ahead.length && isMonthStart(Date.parse(ahead[last + 1].date) / 86_400_000)) last++;
    signals.push({ code: "MONTH_START", priority: 80, data: { upliftPct: Math.round((uplift - 1) * 100), from: ahead[first].label, to: ahead[last].label } });
  }
  const next = demand.revenueForecast.points.slice(1);
  const busiest = next.reduce((best, p) => (p.value > best.value ? p : best), next[0]);
  if (busiest && busiest.value > 0) {
    const weekday = new Date(Date.parse(busiest.date)).getUTCDay();
    signals.push({ code: "BUSY_DAY_AHEAD", priority: 70, data: { day: DAY_NAMES[weekday], date: busiest.label, expectedRevenue: busiest.value } });
  }
  const qr = metric("qrShare");
  if (qr && qr.value < qr.peerMedian - 0.05) {
    signals.push({ code: "PROMOTE_QR", priority: 60, data: { qrShare: qr.value, peerMedian: qr.peerMedian } });
  }
  const repeat = metric("repeatRate");
  if (repeat && repeat.value < repeat.peerMedian - 0.03) {
    signals.push({ code: "BUILD_LOYALTY", priority: 50, data: { repeatRate: repeat.value, peerMedian: repeat.peerMedian } });
  }
  if (demand.busiestHours.length) {
    signals.push({ code: "PEAK_HOURS", priority: 40, data: { hours: [...demand.busiestHours].sort((a, b) => a - b) } });
  }
  return signals.sort((a, b) => b.priority - a.priority).slice(0, 3);
}
