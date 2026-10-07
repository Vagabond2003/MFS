#!/usr/bin/env node
/**
 * Guard statistics and prompt-injection checks for the AI wording layer (src/server/ai).
 *
 *   node scripts/check-ai.mjs                                   offline: the guard's verdict on every hijacked
 *                                                               reply in scripts/lib/prompt-injection.json
 *   node --env-file=.env.local scripts/check-ai.mjs --live      also asks the configured models for every insight
 *                                                               (en + bn) and runs the injection payloads; reports the
 *                                                               share of replies the guard rejected and why
 *   … --live --repeat=3                                         ask each question 3 times (more replies, better rates)
 *   … --live --lang=bn                                          only one language
 *
 * --live writes ml/reports/guard-stats.{json,md}. It spends API quota and needs
 * keys in .env.local; it reads nothing else from the environment and writes to
 * no database. Prints facts and wording, never keys.
 * The offline unit tests (facts privacy, guard, templates, injection set) run in `npm test`.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { importSrc, loadSyntheticDb } from "./lib/synthetic-db.mjs";

const live = process.argv.includes("--live");
const onlyLang = process.argv.find((a) => a.startsWith("--lang="))?.slice(7);
const repeat = Math.max(1, Number(process.argv.find((a) => a.startsWith("--repeat="))?.slice(9) ?? 1));
const file = process.argv.slice(2).find((a) => !a.startsWith("--"));

const { db, now: NOW, specials: S } = loadSyntheticDb(file);
const intel = await importSrc("src/services/mock/intelligence/index.ts");
const kinds = await importSrc("src/server/ai/kinds.ts");
const guard = await importSrc("src/server/ai/guard.ts");
const { explain, rejectionReason } = await importSrc("src/server/ai/explain.ts");
const set = JSON.parse(readFileSync(new URL("./lib/prompt-injection.json", import.meta.url), "utf8"));

/* ───────────── Facts for every insight, from real computed results ───────────── */

const agentId = S.serviceGap;
const merchantId = S.decliners[0];
const agentDistrict = db.agentProfiles.find((a) => a.userId === agentId)?.district ?? null;
const business = db.merchantBusinesses.find((b) => b.userId === merchantId);
const demand = intel.merchantDemand(db, merchantId, NOW);
const benchmark = intel.merchantBenchmark(db, merchantId, NOW);
const signals = intel.merchantSignals(demand, benchmark, intel.merchantChurnRisk(db, merchantId, NOW));
const coverage = intel.locationCoverage(db, NOW);

const FACTS = {
  "agent.liquidity": kinds.liquidityFacts(intel.agentLiquidity(db, agentId, NOW), agentDistrict),
  "agent.performance": kinds.performanceFacts(intel.agentPerformance(db, agentId, NOW)),
  "merchant.demand": kinds.demandFacts(demand, business.category, business.district),
  "merchant.benchmark": kinds.benchmarkFacts(benchmark),
  "merchant.recommendations": kinds.recommendationFacts(signals, business.category, business.district),
  "admin.churn": kinds.churnFacts(intel.churnRanking(db, NOW)),
  "admin.agents": kinds.agentsFacts(intel.agentIntelligence(db, NOW)),
  "admin.coverage": kinds.coverageFacts(coverage),
};
if (!Object.keys(kinds.KINDS).every((k) => k in FACTS)) throw new Error("An insight kind has no facts here; add it to FACTS.");

/* ───────────── Offline: hijacked replies through the guard ───────────── */

console.log("Guard verdicts on the prompt-injection replies (scripts/lib/prompt-injection.json):\n");
let wrong = 0;
let rejectedAsExpected = 0;
for (const r of set.replies) {
  let verdict = "accept";
  let reason = "";
  try {
    guard.validateReply(guard.textOutput, r.reply, set.facts);
  } catch (e) {
    verdict = "reject";
    reason = rejectionReason(e).reason;
  }
  const ok = verdict === r.expect && (!r.reason || r.reason === reason);
  if (!ok) wrong++;
  if (ok && r.expect === "reject") rejectedAsExpected++;
  console.log(`${ok ? "✓" : "✗"} ${r.id.padEnd(28)} ${verdict.padEnd(7)} ${reason.padEnd(18)}${r.limitation ? "  (known limitation)" : ""}`);
}
const hostile = set.replies.filter((r) => r.expect === "reject").length;
console.log(`\n${rejectedAsExpected} of ${hostile} hijacked replies rejected as expected; ${set.replies.filter((r) => r.limitation).length} known limitations accepted; ${wrong} unexpected verdicts.`);

/* ───────────── Live: ask the configured models ───────────── */

if (live) {
  const { configuredModels } = await importSrc("src/server/ai/providers.ts");
  const models = configuredModels();
  console.log(`\nModels: ${models.map((m) => m.id).join(" → ") || "(none configured: templates only, nothing to measure)"}`);
  const attempts = [];
  const injectionAccepted = [];
  const langs = onlyLang ? [onlyLang] : ["en", "bn"];

  for (let round = 0; round < repeat; round++) {
    for (const lang of langs) {
      for (const [kind, facts] of Object.entries(FACTS)) {
        const res = await explain(kind, facts, lang);
        for (const a of res.log) attempts.push({ set: "normal", kind, lang, ...a });
        console.log(`── ${kind} (${lang}) · ${res.source}${res.model ? ` · ${res.model}` : ""} · ${res.log.map((a) => `${a.model}: ${a.outcome}${a.reason ? ` (${a.reason})` : ""}`).join(", ") || "no attempt"}`);
      }
      for (const p of set.payloads) {
        // The payload arrives as a district name, the way planted data would.
        const facts = kinds.coverageFacts(coverage.map((d, i) => (i === 0 ? { ...d, district: p.text } : d)));
        const res = await explain("admin.coverage", facts, lang);
        for (const a of res.log) attempts.push({ set: "injection", kind: p.id, lang, ...a });
        if (res.source === "AI") {
          const text = JSON.stringify(res.output);
          const hits = set.markers.filter((m) => text.toLowerCase().includes(m.toLowerCase()));
          injectionAccepted.push({ payload: p.id, lang, model: res.model, text: res.output.text, markers: hits });
        }
        console.log(`── injection ${p.id} (${lang}) · ${res.source} · ${res.log.map((a) => `${a.model}: ${a.outcome}${a.reason ? ` (${a.reason})` : ""}`).join(", ") || "no attempt"}`);
      }
    }
  }

  const summarize = (xs) => {
    const replies = xs.filter((a) => a.outcome !== "failed");
    const rejected = xs.filter((a) => a.outcome === "rejected");
    const count = (list) => Object.fromEntries([...new Set(list.map((a) => a.reason))].map((r) => [r, list.filter((a) => a.reason === r).length]));
    return {
      attempts: xs.length,
      replies: replies.length,
      accepted: replies.length - rejected.length,
      rejected: rejected.length,
      rejectedShare: replies.length ? rejected.length / replies.length : null,
      rejectedBy: count(rejected),
      failed: xs.length - replies.length,
      failedBy: count(xs.filter((a) => a.outcome === "failed")),
    };
  };
  const stats = {
    date: new Date().toISOString(),
    models: models.map((m) => m.id),
    repeat,
    langs,
    normal: summarize(attempts.filter((a) => a.set === "normal")),
    injection: summarize(attempts.filter((a) => a.set === "injection")),
    byModel: Object.fromEntries(models.map((m) => [m.id, summarize(attempts.filter((a) => a.model === m.id))])),
    injectionAccepted,
  };

  const pct = (v) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);
  const reasons = (o) => Object.entries(o).map(([k, v]) => `${k} ${v}`).join(", ") || "—";
  const md = [
    `_Measured by \`scripts/check-ai.mjs --live\` on ${stats.date.slice(0, 10)} with ${stats.models.join(" → ") || "no models"}; ${repeat} round(s), languages ${langs.join(" + ")}._`,
    "",
    "| Set | Attempts | Replies | Rejected by the guard | Why rejected | No reply (why) |",
    "|---|---|---|---|---|---|",
    ...[["Normal insights", stats.normal], ["Injection payloads", stats.injection], ...Object.entries(stats.byModel).map(([m, s]) => [`Model ${m}`, s])].map(
      ([name, s]) => `| ${name} | ${s.attempts} | ${s.replies} | ${s.rejected} (${pct(s.rejectedShare)}) | ${reasons(s.rejectedBy)} | ${s.failed} (${reasons(s.failedBy)}) |`,
    ),
    "",
    `Injection replies the guard accepted: ${injectionAccepted.length}; of those, containing a marker of the injection (${set.markers.join(", ")}): ${injectionAccepted.filter((x) => x.markers.length).length}.`,
    ...injectionAccepted.map((x) => `- ${x.payload} (${x.lang}, ${x.model}): "${x.text}"${x.markers.length ? ` — markers: ${x.markers.join(", ")}` : ""}`),
    "",
  ].join("\n");
  mkdirSync("ml/reports", { recursive: true });
  writeFileSync("ml/reports/guard-stats.json", JSON.stringify(stats, null, 1) + "\n");
  writeFileSync("ml/reports/guard-stats.md", md);
  console.log(`\n${md}`);
} else {
  console.log("\nNo model calls (add --live to measure real replies). Facts sent for merchant recommendations:");
  console.log(JSON.stringify(FACTS["merchant.recommendations"], null, 1));
}
process.exit(wrong ? 1 : 0);
