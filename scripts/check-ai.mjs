#!/usr/bin/env node
/**
 * Checks for the AI wording layer (src/server/ai) on the synthetic dataset.
 *
 *   node scripts/check-ai.mjs                                 offline: facts privacy, output guard, templates (en + bn)
 *   node --env-file=.env.local scripts/check-ai.mjs --live    also asks the configured models for every insight
 *   … --live --lang=bn                                        only one language
 *
 * Prints the facts sent to the models and the wording that came back — never keys.
 */
import { checker, importSrc, loadSyntheticDb } from "./lib/synthetic-db.mjs";

const live = process.argv.includes("--live");
const onlyLang = process.argv.find((a) => a.startsWith("--lang="))?.slice(7);
const file = process.argv.slice(2).find((a) => !a.startsWith("--"));

const { db, now: NOW, specials: S } = loadSyntheticDb(file);
const intel = await importSrc("src/services/mock/intelligence/index.ts");
const kinds = await importSrc("src/server/ai/kinds.ts");
const guard = await importSrc("src/server/ai/guard.ts");
const { explain } = await importSrc("src/server/ai/explain.ts");
const { translator } = await importSrc("src/lib/i18n/core.ts");
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

check("every insight kind has a facts builder", Object.keys(kinds.KINDS).every((k) => k in FACTS));

/* ───────────── Privacy: nothing identifying reaches a model ───────────── */

{
  const sent = JSON.stringify(FACTS);
  const identifiers = new Set();
  for (const u of db.users) [u.id, u.fullName, u.phone, u.email].forEach((v) => v && identifiers.add(String(v)));
  for (const a of db.agentProfiles) [a.agentCode, a.outletName, a.area].forEach((v) => v && identifiers.add(String(v)));
  for (const b of db.merchantBusinesses) [b.id, b.businessName, b.merchantNumber, b.area, b.address].forEach((v) => v && identifiers.add(String(v)));
  for (const t of db.transactions.slice(0, 2000)) identifiers.add(t.id);
  const leaked = [...identifiers].filter((v) => v.length >= 4 && sent.includes(v));
  check("facts contain no names, phone numbers, ids, codes or addresses", leaked.length === 0, leaked.slice(0, 3).join(", "));
  check("facts contain no NID-like digit runs", !/\d{10,}/.test(sent.replace(/,/g, "")));
}

/* ───────────── Output guard ───────────── */

{
  const facts = { amount: "৳12,500", share_pct: 37 };
  const ok = (reply, expected) => {
    try {
      guard.validateReply(guard.textOutput, reply, facts, expected);
      return true;
    } catch {
      return false;
    }
  };
  check("guard: accepts figures copied from the facts", ok('{"text":"Expect about ৳12,500 this week, 37% from repeat customers."}'));
  check("guard: Bengali digits count as the same figures", ok('{"text":"এই সপ্তাহে প্রায় ৳১২,৫০০ বিক্রি, ৩৭% নিয়মিত গ্রাহক থেকে।"}'));
  check("guard: rejects an amount that isn't in the facts", !ok('{"text":"Expect about ৳13,000 this week."}'));
  check("guard: rejects invented Bengali figures", !ok('{"text":"প্রায় ৳১৩,০০০ বিক্রি হতে পারে।"}'));
  check("guard: rejects markup and links", !ok('{"text":"See **this** at https://example.com now"}'));
  check("guard: rejects extra fields", !ok('{"text":"Expect about ৳12,500 this week.","amount":5}'));
  check("guard: reads JSON inside a code fence", ok('```json\n{"text":"Expect about ৳12,500 this week."}\n```'));
  check("guard: rejects non-JSON", !ok("Expect about ৳12,500 this week."));
}

/* ───────────── Templates: always available, and they pass the same guard ───────────── */

for (const lang of ["en", "bn"]) {
  for (const [kind, facts] of Object.entries(FACTS)) {
    const def = kinds.KINDS[kind];
    const output = def.template(facts, translator(lang), lang);
    const schema = kinds.schemaFor(kind);
    const parsed = schema.safeParse(output);
    const strings = def.output === "text" ? [output.text] : output.items.flatMap((i) => [i.title, i.detail]);
    const invented = guard.inventedNumbers(strings.join(" "), facts);
    const rightLanguage = (lang === "bn") === /[\u0985-\u09B9]/.test(strings.join(" "));
    check(`template ${kind} (${lang}): valid shape, no invented figures`, parsed.success && invented.length === 0 && rightLanguage, invented.join(", ") || (parsed.success ? "" : parsed.error.issues[0]?.message));
    if (def.output === "recommendations") check(`template ${kind} (${lang}): one item per signal`, output.items.length === facts.signals.length, `${output.items.length} items`);
  }
}

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
