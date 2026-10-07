import { afterEach, describe, expect, it, vi } from "vitest";
import { translator } from "@/lib/i18n/core";
import { explain } from "@/server/ai/explain";
import { inventedNumbers, textOutput, validateReply } from "@/server/ai/guard";
import * as kinds from "@/server/ai/kinds";
import type { FactsOf, InsightKind } from "@/server/ai/kinds";
import { callModel, type ModelSpec } from "@/server/ai/providers";
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
} from "@/services/mock/intelligence";
import { syntheticAt } from "./helpers/synthetic";

// No test talks to a real model: replies come from this stub.
vi.mock("@/server/ai/providers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/ai/providers")>()),
  callModel: vi.fn(),
}));

/** Facts for every insight kind, built from real computed results on the pinned synthetic dataset. */
function allFacts(): { [K in InsightKind]: FactsOf<K> } {
  const { db, now, specials: S } = syntheticAt();
  const agentId = S.serviceGap;
  const merchantId = S.decliners[0];
  const district = db.agentProfiles.find((a) => a.userId === agentId)?.district ?? null;
  const business = db.merchantBusinesses.find((b) => b.userId === merchantId)!;
  const demand = merchantDemand(db, merchantId, now);
  const benchmark = merchantBenchmark(db, merchantId, now);
  const signals = merchantSignals(demand, benchmark, merchantChurnRisk(db, merchantId, now));
  return {
    "agent.liquidity": kinds.liquidityFacts(agentLiquidity(db, agentId, now), district),
    "agent.performance": kinds.performanceFacts(agentPerformance(db, agentId, now)),
    "merchant.demand": kinds.demandFacts(demand, business.category, business.district ?? null),
    "merchant.benchmark": kinds.benchmarkFacts(benchmark),
    "merchant.recommendations": kinds.recommendationFacts(signals, business.category, business.district ?? null),
    "admin.churn": kinds.churnFacts(churnRanking(db, now)),
    "admin.agents": kinds.agentsFacts(agentIntelligence(db, now)),
    "admin.coverage": kinds.coverageFacts(locationCoverage(db, now)),
  };
}

const KIND_NAMES = Object.keys(kinds.KINDS) as InsightKind[];

describe("facts sent to a model", () => {
  it("exist for every insight kind", () => {
    expect(Object.keys(allFacts()).sort()).toEqual([...KIND_NAMES].sort());
  });

  it("contain no names, phone numbers, ids, codes or addresses", () => {
    const { db } = syntheticAt();
    const sent = JSON.stringify(allFacts());
    const identifiers = new Set<string>();
    for (const u of db.users) [u.id, u.name, u.phone, u.email].forEach((v) => v && identifiers.add(String(v)));
    for (const a of db.agentProfiles) [a.agentCode, a.outletName, a.area].forEach((v) => v && identifiers.add(String(v)));
    for (const b of db.merchantBusinesses) [b.id, b.businessName, b.merchantId, b.area, b.businessAddress].forEach((v) => v && identifiers.add(String(v)));
    for (const t of db.transactions.slice(0, 2000)) identifiers.add(t.id);
    expect([...identifiers].filter((v) => v.length >= 4 && sent.includes(v))).toEqual([]);
  });

  it("contain no NID-like digit runs", () => {
    expect(JSON.stringify(allFacts()).replace(/,/g, "")).not.toMatch(/\d{10,}/);
  });
});

describe("output guard", () => {
  const facts = { amount: "৳12,500", share_pct: 37 };
  const accepts = (reply: string) => {
    try {
      validateReply(textOutput, reply, facts);
      return true;
    } catch {
      return false;
    }
  };

  it("accepts figures copied from the facts", () => expect(accepts('{"text":"Expect about ৳12,500 this week, 37% from repeat customers."}')).toBe(true));
  it("counts Bengali digits as the same figures", () => expect(accepts('{"text":"এই সপ্তাহে প্রায় ৳১২,৫০০ বিক্রি, ৩৭% নিয়মিত গ্রাহক থেকে।"}')).toBe(true));
  it("rejects an amount that isn't in the facts", () => expect(accepts('{"text":"Expect about ৳13,000 this week."}')).toBe(false));
  it("rejects invented Bengali figures", () => expect(accepts('{"text":"প্রায় ৳১৩,০০০ বিক্রি হতে পারে।"}')).toBe(false));
  it("rejects markup and links", () => expect(accepts('{"text":"See **this** at https://example.com now"}')).toBe(false));
  it("rejects extra fields", () => expect(accepts('{"text":"Expect about ৳12,500 this week.","amount":5}')).toBe(false));
  it("reads JSON inside a code fence", () => expect(accepts('```json\n{"text":"Expect about ৳12,500 this week."}\n```')).toBe(true));
  it("rejects non-JSON", () => expect(accepts("Expect about ৳12,500 this week.")).toBe(false));
});

describe.each(["en", "bn"] as const)("templates (%s)", (lang) => {
  it.each(KIND_NAMES)("%s: valid shape, right language, no invented figures", (kind) => {
    const facts = allFacts()[kind];
    const def = kinds.KINDS[kind];
    const output = (def.template as (f: unknown, t: ReturnType<typeof translator>, l: typeof lang) => { text?: string; items?: { title: string; detail: string }[] })(facts, translator(lang), lang);
    expect(kinds.schemaFor(kind).safeParse(output).success).toBe(true);
    const strings = def.output === "text" ? [output.text!] : output.items!.flatMap((i) => [i.title, i.detail]);
    expect(inventedNumbers(strings.join(" "), facts)).toEqual([]);
    expect(/[অ-হ]/.test(strings.join(" "))).toBe(lang === "bn");
    if (def.output === "recommendations") expect(output.items).toHaveLength((facts as kinds.RecommendationFacts).signals.length);
  });
});

describe("explain(): the model only words the computed figures", () => {
  const model: ModelSpec = { id: "stub-model", provider: "groq", timeoutMs: 8_000, perMinute: 1_000 };
  const reply = vi.mocked(callModel);
  afterEach(() => reply.mockReset());

  it("uses a reply that passes the guard", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    reply.mockResolvedValueOnce('{"text":"Gazipur is the most underserved district; add agents there first."}');
    const res = await explain("admin.coverage", allFacts()["admin.coverage"], "en", { models: [model] });
    expect(res).toMatchObject({ source: "AI", model: "stub-model", output: { text: "Gazipur is the most underserved district; add agents there first." } });
  });

  it.each([
    ["a figure that isn't in the facts", '{"text":"Gazipur needs 98,765 more agents right away."}', "en"],
    ["the wrong language", '{"text":"Gazipur is the most underserved district; add agents there first."}', "bn"],
    ["the wrong shape", '{"summary":"Gazipur is the most underserved district."}', "en"],
  ] as const)("falls back to the template on %s", async (_, text, lang) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    reply.mockResolvedValueOnce(text);
    const facts = allFacts()["admin.coverage"];
    const res = await explain("admin.coverage", facts, lang, { models: [model] });
    expect(res.source).toBe("TEMPLATE");
    expect(res.output).toEqual(kinds.KINDS["admin.coverage"].template(facts, translator(lang), lang));
  });

  it("answers from the template when no model is configured", async () => {
    const res = await explain("admin.coverage", allFacts()["admin.coverage"], "en", { models: [] });
    expect(res.source).toBe("TEMPLATE");
    expect(reply).not.toHaveBeenCalled();
  });
});
