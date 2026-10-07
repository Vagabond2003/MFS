#!/usr/bin/env node
/**
 * Asks the configured models (src/server/ai) to word every insight on the
 * synthetic dataset, and checks each answered within the deadline.
 *
 *   node --env-file=.env.local scripts/check-ai.mjs --live    both languages
 *   … --live --lang=bn                                        only one language
 *   node scripts/check-ai.mjs                                 no model calls: prints the facts a model would get
 *
 * The offline checks (facts privacy, output guard, templates in en + bn) run in `npm test` (tests/ai.test.ts).
 * Prints the facts sent to the models and the wording that came back — never keys.
 */
import { checker, importSrc, loadSyntheticDb } from "./lib/synthetic-db.mjs";

const live = process.argv.includes("--live");
const onlyLang = process.argv.find((a) => a.startsWith("--lang="))?.slice(7);
const file = process.argv.slice(2).find((a) => !a.startsWith("--"));

const { db, now: NOW, specials: S } = loadSyntheticDb(file);
const intel = await importSrc("src/services/mock/intelligence/index.ts");
const kinds = await importSrc("src/server/ai/kinds.ts");
const { explain } = await importSrc("src/server/ai/explain.ts");
const { check, summary } = checker();

/* ───────────── Facts for every insight, from real computed results ───────────── */

const agentId = S.serviceGap;
const merchantId = S.decliners[0];
const agentDistrict = db.agentProfiles.find((a) => a.userId === agentId)?.district ?? null;
const business = db.merchantBusinesses.find((b) => b.userId === merchantId);

const demand = intel.merchantDemand(db, merchantId, NOW);
const benchmark = intel.merchantBenchmark(db, merchantId, NOW);
const churn = intel.merchantChurnRisk(db, merchantId, NOW);
const signals = intel.merchantSignals(demand, benchmark, churn);

const FACTS = {
  "agent.liquidity": kinds.liquidityFacts(intel.agentLiquidity(db, agentId, NOW), agentDistrict),
  "agent.performance": kinds.performanceFacts(intel.agentPerformance(db, agentId, NOW)),
  "merchant.demand": kinds.demandFacts(demand, business.category, business.district),
  "merchant.benchmark": kinds.benchmarkFacts(benchmark),
  "merchant.recommendations": kinds.recommendationFacts(signals, business.category, business.district),
  "admin.churn": kinds.churnFacts(intel.churnRanking(db, NOW)),
  "admin.agents": kinds.agentsFacts(intel.agentIntelligence(db, NOW)),
  "admin.coverage": kinds.coverageFacts(intel.locationCoverage(db, NOW)),
};

if (!Object.keys(kinds.KINDS).every((k) => k in FACTS)) throw new Error("An insight kind has no facts here; add it to FACTS.");

/* ───────────── Live: ask the configured models ───────────── */

if (live) {
  const { configuredModels } = await importSrc("src/server/ai/providers.ts");
  const models = configuredModels();
  console.log(`\nModels: ${models.map((m) => m.id).join(" → ") || "(none configured — templates only)"}`);
  for (const lang of onlyLang ? [onlyLang] : ["en", "bn"]) {
    for (const [kind, facts] of Object.entries(FACTS)) {
      const started = Date.now();
      const res = await explain(kind, facts, lang);
      const ms = Date.now() - started;
      console.log(`\n── ${kind} (${lang}) · ${res.source}${res.model ? ` · ${res.model}` : ""} · ${ms} ms`);
      if (res.output.text) console.log(res.output.text);
      else for (const item of res.output.items) console.log(`• ${item.title} — ${item.detail}`);
      check(`live ${kind} (${lang}): answered within the deadline`, ms < 20_000, `${ms} ms`);
    }
  }
} else {
  console.log("\nFacts sent to the models (merchant recommendations):");
  console.log(JSON.stringify(FACTS["merchant.recommendations"], null, 1));
}

summary();
