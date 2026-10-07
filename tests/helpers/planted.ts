import { expect, it } from "vitest";
import { agentIntelligence, agentLiquidity, churnRanking, locationCoverage } from "@/services/mock/intelligence";
import { syntheticAt } from "./synthetic";

/**
 * The patterns scripts/seed-synthetic.mjs plants, checked at one anchor. The
 * thresholds are the ones the old scripts/check-intelligence.mjs used; the dataset is
 * generated when the test runs, not when the file is collected.
 */
export function plantedPatternTests(anchor: string) {
  const load = () => {
    const ds = syntheticAt(anchor);
    const agents = agentIntelligence(ds.db, ds.now);
    const byId = new Map(agents.map((a) => [a.userId, a]));
    const codes = (id: string) => byId.get(id)?.flags.map((f) => f.code) ?? [];
    return { ...ds, S: ds.specials, agents, byId, codes };
  };

  it("anomalies: near-limit agent flagged", () => {
    const { S, codes } = load();
    expect(codes(S.nearLimit)).toContain("NEAR_LIMIT_CASH_OUTS");
  });

  it("anomalies: repeated-customer pattern flagged", () => {
    const { S, codes } = load();
    expect([...codes(S.nearLimit), ...codes(S.offHours)]).toContain("REPEATED_CUSTOMER");
  });

  it("anomalies: off-hours agent flagged", () => {
    const { S, codes } = load();
    expect(codes(S.offHours)).toContain("OFF_HOURS_ACTIVITY");
  });

  it("anomalies: the fast-growing agent is a rising performer", () => {
    const { S, byId } = load();
    for (const id of S.rising) {
      const a = byId.get(id)!;
      // The whole row in the failure message: counts, growth and flags explain a miss.
      expect({ rising: a.rising, transactions28: a.transactions28, transactionsGrowthPct: a.transactionsGrowthPct, growthPct: a.growthPct, flags: a.flags.map((f) => `${f.code}:${f.severity}`) }).toMatchObject({ rising: true });
    }
  });

  it("anomalies: few other agents count as rising", () => {
    const { S, agents } = load();
    const others = agents.filter((a) => a.rising && !S.rising.includes(a.userId)).map((a) => `${a.outletName} +${a.transactionsGrowthPct}%`);
    expect(others.length, others.join(", ")).toBeLessThanOrEqual(2);
  });

  it("anomalies: Gazipur agent shows a service gap", () => {
    const { S, byId } = load();
    expect(byId.get(S.serviceGap)?.serviceGap).not.toBeNull();
  });

  it("anomalies: ordinary agents are not flagged", () => {
    const { S, agents } = load();
    const planted = new Set([S.nearLimit, S.offHours]);
    const falseFlags = agents.filter((a) => !planted.has(a.userId) && a.flags.some((f) => f.code !== "VOLUME_SPIKE")).map((a) => `${a.outletName}: ${a.flags.map((f) => f.code)}`);
    expect(falseFlags.length, falseFlags.join("; ")).toBeLessThanOrEqual(1);
  });

  it("liquidity: the overloaded Gazipur agent has frequent low-cash days", () => {
    const { db, now, S } = load();
    expect(agentLiquidity(db, S.serviceGap, now).lowCashDays30).toBeGreaterThanOrEqual(5);
  });

  it("churn: the declining merchants rank at the top", () => {
    const { db, now, S } = load();
    const top = churnRanking(db, now).slice(0, S.decliners.length + 1).map((r) => r.userId);
    expect(top).toEqual(expect.arrayContaining(S.decliners));
  });

  it("churn: decliners score at least MEDIUM", () => {
    const { db, now, S } = load();
    const ranking = churnRanking(db, now);
    for (const id of S.decliners) expect(ranking.find((r) => r.userId === id)?.level).toMatch(/^(MEDIUM|HIGH)$/);
  });

  it("coverage: Gazipur is the most underserved district and needs more agents", () => {
    const { db, now } = load();
    const [first] = locationCoverage(db, now);
    expect(first.district).toBe("Gazipur");
    expect(first.agentsNeeded).toBeGreaterThan(0);
  });
}
