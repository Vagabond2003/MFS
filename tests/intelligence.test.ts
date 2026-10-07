import { describe, expect, it } from "vitest";
import {
  agentLiquidity,
  agentPerformance,
  churnRanking,
  forecastSeries,
  locationCoverage,
  merchantBenchmark,
  merchantDemand,
} from "@/services/mock/intelligence";
import { plantedPatternTests } from "./helpers/planted";
import { PINNED_NOW, syntheticAt } from "./helpers/synthetic";

const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const DAY_MS = 86_400_000;

describe("forecast", () => {
  const today = 20_000; // a fixed Dhaka day number
  const weekday = (day: number) => new Date(day * DAY_MS).getUTCDay();
  const series = (f: (day: number, i: number) => number) => Array.from({ length: 56 }, (_, i) => f(today - 56 + i, i));

  it("recovers a weekly pattern with no trend, and the band contains the point", () => {
    const pattern = [1, 1, 1, 1, 1.5, 0.5, 1]; // Sun..Sat
    const f = forecastSeries(series((day) => 100 * pattern[weekday(day)]), today, {});
    expect(f.points).toHaveLength(8); // today + 7
    expect(f.weekdayIndex[4]).toBeGreaterThan(1.3);
    expect(f.weekdayIndex[5]).toBeLessThan(0.7);
    expect(Math.abs(f.trendPerWeekPct)).toBeLessThan(2);
    for (const p of f.points) {
      expect(p.low).toBeGreaterThanOrEqual(0);
      expect(p.low).toBeLessThanOrEqual(p.value);
      expect(p.value).toBeLessThanOrEqual(p.high);
    }
  });

  it("rising series → positive trend and rising points", () => {
    const g = forecastSeries(series((_, i) => 50 + 2 * i), today, {});
    expect(g.trendPerWeekPct).toBeGreaterThan(5);
    expect(g.points[7].value).toBeGreaterThan(g.points[0].value);
  });

  it("detects the start-of-month uplift", () => {
    const m = forecastSeries(series((day) => (new Date(day * DAY_MS).getUTCDate() <= 5 ? 200 : 100)), today, { monthStart: true });
    expect(m.monthStartUplift).not.toBeNull();
    expect(Math.abs(m.monthStartUplift! - 2)).toBeLessThan(0.35);
  });
});

describe(`intelligence on the synthetic dataset (now = ${PINNED_NOW})`, () => {
  describe("merchant demand", () => {
    it("28 days of actuals, 8 forecast points in integer poisha, 24 hours, shares add up", () => {
      const { db, now } = syntheticAt();
      const d = merchantDemand(db, "usr_nafiztong", now);
      expect(d.actual).toHaveLength(28);
      expect(d.revenueForecast.points).toHaveLength(8);
      for (const p of d.revenueForecast.points) for (const v of [p.value, p.low, p.high]) expect(Number.isInteger(v)).toBe(true);
      expect(d.hours).toHaveLength(24);
      expect(d.busiestHours.length).toBeGreaterThan(0);
      expect(d.busiestHours.length).toBeLessThanOrEqual(3);
      expect(d.breakdown.repeatShare + d.breakdown.newShare).toBeCloseTo(1, 2);
      expect(d.breakdown.method.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 2);
    });
  });

  describe("agent liquidity", () => {
    const cases = [
      ["service-gap agent", (s: ReturnType<typeof syntheticAt>["specials"]) => s.serviceGap],
      ["demo agent", () => "usr_sabbir_tele"],
      ["rising agent", (s: ReturnType<typeof syntheticAt>["specials"]) => s.rising[0]],
    ] as const;

    it.each(cases)("%s: 8 projected days that chain from the real wallet, whole ৳1,000 suggestions, 14 days of history", (_, pick) => {
      const { db, now, specials } = syntheticAt();
      const l = agentLiquidity(db, pick(specials), now);
      expect(l.days).toHaveLength(8);
      l.days.forEach((d, i) => {
        expect(d.closingCash).toBe(d.openingCash + d.cashIn + d.otherCashIn - d.cashOut);
        expect(d.closingFloat).toBe(d.openingFloat - d.cashIn - d.otherCashIn + d.cashOut + d.commission);
        if (i > 0) {
          expect(d.openingCash).toBe(l.days[i - 1].closingCash);
          expect(d.openingFloat).toBe(l.days[i - 1].closingFloat);
        }
      });
      expect(l.days[0].openingCash).toBe(l.cashInHand);
      expect(l.days[0].openingFloat).toBe(l.float);
      for (const s of l.suggestions) {
        expect(s.amount).toBeGreaterThan(0);
        expect(s.amount % 100_000).toBe(0);
      }
      expect(l.history).toHaveLength(14);
      for (const h of l.history) expect(finite(h.cash) && finite(h.float)).toBe(true);
    });

    it("reconstructed balances never go negative", () => {
      const { db, now, specials } = syntheticAt();
      for (const h of agentLiquidity(db, specials.rising[0], now).history) {
        expect(h.cash).toBeGreaterThanOrEqual(0);
        expect(h.float).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("churn", () => {
    it("typical merchant is low risk; scores 0–100 with named factors", () => {
      const { db, now, specials } = syntheticAt();
      const ranking = churnRanking(db, now);
      const others = ranking.filter((r) => !specials.decliners.includes(r.userId)).map((r) => r.score).sort((a, b) => a - b);
      expect(others[others.length >> 1]).toBeLessThan(35);
      for (const r of ranking) {
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(100);
        for (const f of r.factors) expect(f.points).toBeGreaterThan(0);
      }
    });
  });

  describe("merchant benchmark", () => {
    it("compares with other merchants on 5 metrics with percentiles 0–100", () => {
      const { db, now } = syntheticAt();
      const b = merchantBenchmark(db, "usr_nafiztong", now);
      // The dataset has 5 merchants, so peers are "all other merchants" (at most 4).
      expect(b.peerCount).toBeGreaterThanOrEqual(2);
      expect(b.metrics).toHaveLength(5);
      for (const m of b.metrics) {
        expect(m.percentile).toBeGreaterThanOrEqual(0);
        expect(m.percentile).toBeLessThanOrEqual(100);
        expect(finite(m.value) && finite(m.peerMedian)).toBe(true);
      }
    });

    it("reveals no other merchant", () => {
      const { db, now } = syntheticAt();
      const json = JSON.stringify(merchantBenchmark(db, "usr_nafiztong", now));
      const leaks = db.merchantBusinesses.filter((x) => x.userId !== "usr_nafiztong" && [x.userId, x.merchantId, x.businessName].some((v) => json.includes(v)));
      expect(leaks.map((x) => x.businessName)).toEqual([]);
    });

    it("falls back when a district has too few peers", () => {
      const { db, now } = syntheticAt();
      const gazipurShop = db.merchantBusinesses.find((x) => x.district === "Gazipur")!;
      expect(merchantBenchmark(db, gazipurShop.userId, now).scope).not.toBe("CATEGORY_DISTRICT");
    });
  });

  describe("agent performance", () => {
    it("own metrics with an anonymous rank", () => {
      const { db, now } = syntheticAt();
      const perf = agentPerformance(db, "usr_sabbir_tele", now);
      expect(perf.weekly).toHaveLength(8);
      expect(perf.rank.peers).toBeGreaterThan(0);
      expect(perf.rank.percentile).toBeGreaterThanOrEqual(0);
      expect(perf.rank.percentile).toBeLessThanOrEqual(100);
    });
  });

  describe("coverage", () => {
    it("all 4 districts ranked", () => {
      const { db, now } = syntheticAt();
      const cov = locationCoverage(db, now);
      expect(cov.map((c) => c.rank)).toEqual([1, 2, 3, 4]);
    });
  });

  describe("planted patterns", () => plantedPatternTests(PINNED_NOW));
});
