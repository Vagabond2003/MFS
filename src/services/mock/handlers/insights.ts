import { planNote, resolveNote, agentsFacts, benchmarkFacts, churnFacts, coverageFacts, demandFacts, liquidityFacts, performanceFacts, recommendationFacts } from "@/server/ai";
import type { InsightsApi } from "../../contracts";
import { ApiError } from "../../errors";
import { requireCaller } from "../context";
import {
  agentIntelligence,
  agentLiquidity,
  agentPerformance,
  churnRanking,
  locationCoverage,
  merchantBenchmark,
  merchantChurnRisk,
  merchantDemand,
  merchantSignals,
} from "../intelligence";
import { requestEnv } from "../runtime";
import type { DbState, UserRecord } from "../schema";
import { read } from "../store";

/**
 * Merchant & agent intelligence. Figures come from the pure functions in
 * ../intelligence over one read snapshot; the wording (`ai`) is resolved
 * afterwards, outside any transaction (see src/server/ai/notes.ts).
 *
 * Agents and merchants only ever get their own figures — peer comparisons are
 * medians and percentiles, never another business. Admins see the network.
 */

/** Wording follows the user's saved language, else the interface language. */
const langOf = (user: UserRecord) => user.language ?? requestEnv().lang();

function agentDistrict(db: DbState, userId: string) {
  return db.agentProfiles.find((a) => a.userId === userId)?.district ?? null;
}

function merchantBusiness(db: DbState, userId: string) {
  const business = db.merchantBusinesses.find((b) => b.userId === userId);
  if (!business) throw new ApiError("NOT_FOUND", "Business profile not found.");
  return business;
}

const ADMIN = ["ADMIN"] as const;

export const insights: InsightsApi = {
  /* ───────────── Agent ───────────── */

  async liquidityForecast() {
    const { figures, plan } = await read((db) => {
      const { user } = requireCaller(db, ["AGENT"]);
      const figures = agentLiquidity(db, user.id);
      return { figures, plan: planNote(db, user.id, "agent.liquidity", liquidityFacts(figures, agentDistrict(db, user.id)), langOf(user)) };
    });
    return { ...figures, ai: await resolveNote(plan) };
  },

  async performance() {
    const { figures, plan } = await read((db) => {
      const { user } = requireCaller(db, ["AGENT"]);
      const figures = agentPerformance(db, user.id);
      return { figures, plan: planNote(db, user.id, "agent.performance", performanceFacts(figures), langOf(user)) };
    });
    return { ...figures, ai: await resolveNote(plan) };
  },

  /* ───────────── Merchant ───────────── */

  async demandForecast() {
    const { figures, plan } = await read((db) => {
      const { user } = requireCaller(db, ["MERCHANT"]);
      const business = merchantBusiness(db, user.id);
      const figures = merchantDemand(db, user.id);
      return { figures, plan: planNote(db, user.id, "merchant.demand", demandFacts(figures, business.category, business.district ?? null), langOf(user)) };
    });
    return { ...figures, ai: await resolveNote(plan) };
  },

  async benchmark() {
    const { figures, plan } = await read((db) => {
      const { user } = requireCaller(db, ["MERCHANT"]);
      const figures = merchantBenchmark(db, user.id);
      return { figures, plan: planNote(db, user.id, "merchant.benchmark", benchmarkFacts(figures), langOf(user)) };
    });
    return { ...figures, ai: await resolveNote(plan) };
  },

  async recommendations() {
    const { asOf, topics, plan } = await read((db) => {
      const { user } = requireCaller(db, ["MERCHANT"]);
      const business = merchantBusiness(db, user.id);
      const now = Date.now();
      const demand = merchantDemand(db, user.id, now);
      const signals = merchantSignals(demand, merchantBenchmark(db, user.id, now), merchantChurnRisk(db, user.id, now));
      return {
        asOf: demand.asOf,
        topics: signals.map((s) => s.code),
        plan: planNote(db, user.id, "merchant.recommendations", recommendationFacts(signals, business.category, business.district ?? null), langOf(user)),
      };
    });
    return { asOf, topics, ai: await resolveNote(plan) };
  },

  /* ───────────── Admin ───────────── */

  async churnRisk() {
    const { merchants, plan } = await read((db) => {
      const { user } = requireCaller(db, ADMIN);
      const merchants = churnRanking(db);
      return { merchants, plan: planNote(db, user.id, "admin.churn", churnFacts(merchants), langOf(user)) };
    });
    return { asOf: new Date().toISOString(), merchants, ai: await resolveNote(plan) };
  },

  async agentIntelligence() {
    const { agents, plan } = await read((db) => {
      const { user } = requireCaller(db, ADMIN);
      const agents = agentIntelligence(db);
      return { agents, plan: planNote(db, user.id, "admin.agents", agentsFacts(agents), langOf(user)) };
    });
    return { asOf: new Date().toISOString(), agents, ai: await resolveNote(plan) };
  },

  async locationCoverage() {
    const { districts, plan } = await read((db) => {
      const { user } = requireCaller(db, ADMIN);
      const districts = locationCoverage(db);
      return { districts, plan: planNote(db, user.id, "admin.coverage", coverageFacts(districts), langOf(user)) };
    });
    return { asOf: new Date().toISOString(), districts, ai: await resolveNote(plan) };
  },
};
