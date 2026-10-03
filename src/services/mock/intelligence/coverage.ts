import type { DistrictCoverage } from "@/types/domain";
import type { DbState } from "../schema";
import { DAY_MS, median, round1, round3, succeeded, ts } from "./common";

/**
 * District coverage over the last 30 days. Demand is what the district's
 * service points (verified agents and merchants with that district) handled:
 * distinct customers, transactions and volume. A district is underserved when
 * customers per agent and per merchant are high relative to the network
 * median: score = 0.6 × (customers/agent ÷ median) + 0.4 × (customers/merchant ÷ median).
 */

const WINDOW_DAYS = 30;
const SERVICE_TYPES = new Set(["CASH_IN", "CASH_OUT", "MOBILE_RECHARGE", "BILL_PAYMENT", "MERCHANT_PAYMENT"]);

export function locationCoverage(db: DbState, now = Date.now()): DistrictCoverage[] {
  const since = now - WINDOW_DAYS * DAY_MS;
  const verified = new Set(db.users.filter((u) => u.status === "VERIFIED" && (u.role === "AGENT" || u.role === "MERCHANT")).map((u) => u.id));
  const districtOf = new Map<string, string>();
  for (const a of db.agentProfiles) if (a.district && verified.has(a.userId)) districtOf.set(a.userId, a.district);
  for (const b of db.merchantBusinesses) if (b.district && verified.has(b.userId)) districtOf.set(b.userId, b.district);

  const stats = new Map<string, { agents: Set<string>; merchants: Set<string>; customers: Set<string>; transactions: number; volume: number }>();
  const entry = (d: string) => {
    let s = stats.get(d);
    if (!s) stats.set(d, (s = { agents: new Set(), merchants: new Set(), customers: new Set(), transactions: 0, volume: 0 }));
    return s;
  };
  for (const a of db.agentProfiles) if (districtOf.has(a.userId)) entry(a.district!).agents.add(a.userId);
  for (const b of db.merchantBusinesses) if (districtOf.has(b.userId)) entry(b.district!).merchants.add(b.userId);

  for (const t of db.transactions) {
    if (!SERVICE_TYPES.has(t.type) || !succeeded(t) || ts(t) < since || ts(t) > now) continue;
    // The service point is whichever side is an agent or merchant with a known district.
    const point = [t.receiver, t.sender].find((p) => p.userId && (p.kind === "AGENT" || p.kind === "MERCHANT") && districtOf.has(p.userId));
    if (!point?.userId) continue;
    const s = entry(districtOf.get(point.userId)!);
    s.transactions++;
    s.volume += t.amount;
    const customer = [t.sender, t.receiver].find((p) => p.kind === "PERSONAL" && p.userId);
    if (customer?.userId) s.customers.add(customer.userId);
  }

  const rows = [...stats.entries()].map(([district, s]) => ({
    district,
    agents: s.agents.size,
    merchants: s.merchants.size,
    customers30: s.customers.size,
    transactions30: s.transactions,
    volume30: s.volume,
    customersPerAgent: s.agents.size ? round1(s.customers.size / s.agents.size) : null,
    customersPerMerchant: s.merchants.size ? round1(s.customers.size / s.merchants.size) : null,
  }));
  const perAgentMedian = median(rows.map((r) => r.customersPerAgent).filter((v): v is number => v !== null));
  const perMerchantMedian = median(rows.map((r) => r.customersPerMerchant).filter((v): v is number => v !== null));
  // A district with customers but no agent (or merchant) counts as twice the worst observed load.
  const worst = (key: "customersPerAgent" | "customersPerMerchant") => Math.max(1, ...rows.map((r) => r[key] ?? 0)) * 2;
  const ratio = (v: number | null, m: number, fallback: number, customers: number) => (customers === 0 ? 0 : (v ?? fallback) / (m || 1));

  return rows
    .map((r) => ({
      ...r,
      underservedScore: round3(
        0.6 * ratio(r.customersPerAgent, perAgentMedian, worst("customersPerAgent"), r.customers30) +
          0.4 * ratio(r.customersPerMerchant, perMerchantMedian, worst("customersPerMerchant"), r.customers30),
      ),
      agentsNeeded: perAgentMedian > 0 ? Math.max(0, Math.ceil(r.customers30 / perAgentMedian) - r.agents) : 0,
    }))
    .sort((a, b) => b.underservedScore - a.underservedScore || a.district.localeCompare(b.district))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
