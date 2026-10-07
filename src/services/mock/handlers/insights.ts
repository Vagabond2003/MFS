import { planNote, resolveNote, agentsFacts, benchmarkFacts, churnFacts, coverageFacts, demandFacts, liquidityFacts, performanceFacts, recommendationFacts } from "@/server/ai";
import type { FlagReview } from "@/types/domain";
import type { InsightsApi } from "../../contracts";
import { ApiError } from "../../errors";
import { audit, requireCaller } from "../context";
import { randomId } from "../crypto";
import {
  CHURN_MODEL_INFO,
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
import type { DbState, FlagReviewRecord, UserRecord } from "../schema";
import { read, write } from "../store";

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

/* ───────────── Flag reviews ───────────── */

const reviewKey = (kind: string, subjectUserId: string, code: string) => `${kind}:${subjectUserId}:${code}`;

/** The latest decision per flag, as shown on the page. */
function latestReviews(db: DbState) {
  const latest = new Map<string, FlagReview>();
  const sorted = [...(db.flagReviews ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const r of sorted) latest.set(reviewKey(r.kind, r.subjectUserId, r.code), toReview(db, r));
  return latest;
}

function toReview(db: DbState, r: FlagReviewRecord): FlagReview {
  return { decision: r.decision, note: r.note, reviewerName: db.users.find((u) => u.id === r.reviewerId)?.name ?? "—", at: r.createdAt };
}

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
    const { merchants, reviewsEnabled, plan } = await read((db) => {
      const { user } = requireCaller(db, ADMIN);
      const ranking = churnRanking(db);
      const reviews = latestReviews(db);
      const merchants = ranking.map((m) => ({ ...m, review: reviews.get(reviewKey("CHURN", m.userId, "CHURN")) ?? null }));
      return { merchants, reviewsEnabled: !!db.flagReviews, plan: planNote(db, user.id, "admin.churn", churnFacts(ranking), langOf(user)) };
    });
    return { asOf: new Date().toISOString(), merchants, model: CHURN_MODEL_INFO, reviewsEnabled, ai: await resolveNote(plan) };
  },

  async agentIntelligence() {
    const { agents, reviewsEnabled, plan } = await read((db) => {
      const { user } = requireCaller(db, ADMIN);
      const computed = agentIntelligence(db);
      const reviews = latestReviews(db);
      const agents = computed.map((a) => ({ ...a, flags: a.flags.map((f) => ({ ...f, review: reviews.get(reviewKey("AGENT_FLAG", a.userId, f.code)) ?? null })) }));
      return { agents, reviewsEnabled: !!db.flagReviews, plan: planNote(db, user.id, "admin.agents", agentsFacts(computed), langOf(user)) };
    });
    return { asOf: new Date().toISOString(), agents, reviewsEnabled, ai: await resolveNote(plan) };
  },

  async reviewFlag(input) {
    return write((db) => {
      const { user } = requireCaller(db, ADMIN);
      if (!db.flagReviews) throw new ApiError("NOT_SUPPORTED", "Flag reviews can't be saved until the database migration 20261008_flag_reviews.sql has been run.");
      const decision = input?.decision;
      if (decision !== "CONFIRMED" && decision !== "DISMISSED") throw new ApiError("VALIDATION", "Choose confirm or dismiss.");
      const note = typeof input.note === "string" && input.note.trim() ? input.note.trim() : null;
      if (note && note.length > 300) throw new ApiError("VALIDATION", "Keep the note under 300 characters.");

      let code: string;
      let flagValue: number;
      let severity: string;
      if (input.kind === "AGENT_FLAG") {
        const flag = agentIntelligence(db).find((a) => a.userId === input.subjectUserId)?.flags.find((f) => f.code === input.code);
        if (!flag) throw new ApiError("NOT_FOUND", "This flag is no longer raised. Refresh the page.");
        code = flag.code;
        flagValue = flag.value;
        severity = flag.severity;
      } else if (input.kind === "CHURN") {
        const risk = merchantChurnRisk(db, input.subjectUserId);
        if (!risk || risk.level === "LOW") throw new ApiError("NOT_FOUND", "This merchant is no longer flagged. Refresh the page.");
        code = "CHURN";
        flagValue = risk.score;
        severity = risk.level;
      } else {
        throw new ApiError("VALIDATION", "Unknown flag type.");
      }

      const record: FlagReviewRecord = {
        id: randomId("frv"), kind: input.kind, subjectUserId: input.subjectUserId, code, decision, note, flagValue, severity, reviewerId: user.id, createdAt: new Date().toISOString(),
      };
      db.flagReviews.push(record);
      audit(db, { actor: user, action: decision === "CONFIRMED" ? "FLAG_CONFIRMED" : "FLAG_DISMISSED", target: input.subjectUserId, metadata: { kind: input.kind, code, value: flagValue, severity, note } });
      return toReview(db, record);
    });
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
