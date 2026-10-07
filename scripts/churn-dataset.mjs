#!/usr/bin/env node
/**
 * Builds the churn training table from the large synthetic dataset, using the
 * app's own feature code (src/services/mock/intelligence/churn-features.ts),
 * so training and scoring compute features the same way.
 *
 *   node --max-old-space-size=8192 scripts/churn-dataset.mjs     data/large/synthetic.json → data/churn/features.csv
 *
 * One row per (merchant, snapshot):
 *   - snapshots every 7 days, from day 90 of the history (so 60-day windows and
 *     8-week trends are full) to 30 days before its end (so every label is known);
 *   - merchants that are VERIFIED at the snapshot and have enough history for the
 *     model (tenure ≥ 30 days, ≥ 5 payments in the last 60 days); thinner
 *     histories get the rule score in the app and are not modelled;
 *   - features strictly from before the snapshot;
 *   - label = 1 when the merchant has no successful payment in the 30 days after it.
 * Also written: the current rule score (the baseline), whether the merchant was
 * paid in the 14 days before the snapshot (the "still active" subset), category
 * and district (for the fairness check). No ground truth from the generator is used.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { importSrc } from "./lib/synthetic-db.mjs";
import { readSynthetic, toDbState } from "./lib/synthetic-state.mjs";

const IN = process.argv.find((a) => a.startsWith("--in="))?.slice(5) ?? "data/large/synthetic.json";
const OUT = process.argv.find((a) => a.startsWith("--out="))?.slice(6) ?? "data/churn/features.csv";

const { churnSnapshot, hasModelHistory, CHURN_FEATURES } = await importSrc("src/services/mock/intelligence/churn-features.ts");
const { ruleChurnScore } = await importSrc("src/services/mock/intelligence/churn.ts");
const { txnsByUser, succeeded, ts, DAY_MS } = await importSrc("src/services/mock/intelligence/common.ts");

const data = readSynthetic(IN);
const { db, now: END } = toDbState(data);
const FIRST = Date.parse(data.meta.firstDay);
const index = txnsByUser(db);

const header = ["merchant_id", "snapshot", "snapshot_day", ...CHURN_FEATURES, "rule_score", "active14", "category", "district", "label"];
const lines = [header.join(",")];
const merchants = db.users.filter((u) => u.role === "MERCHANT" && u.status === "VERIFIED");
const business = new Map(db.merchantBusinesses.map((b) => [b.userId, b]));
let positives = 0;
let snapshots = 0;

for (let day = 90; ; day += 7) {
  const snapshot = FIRST + day * DAY_MS + 12 * 3_600_000; // noon in Dhaka
  if (snapshot + 30 * DAY_MS > END) break;
  snapshots++;
  for (const u of merchants) {
    if (Date.parse(u.createdAt) > snapshot) continue;
    const s = churnSnapshot(db, u.id, snapshot);
    if (!s || !hasModelHistory(s)) continue;
    const paidAfter = (index.get(u.id) ?? []).some((t) => t.type === "MERCHANT_PAYMENT" && t.receiver.userId === u.id && succeeded(t) && ts(t) >= snapshot && ts(t) < snapshot + 30 * DAY_MS);
    const label = paidAfter ? 0 : 1;
    positives += label;
    const b = business.get(u.id);
    const row = [u.id, new Date(snapshot).toISOString().slice(0, 10), day, ...CHURN_FEATURES.map((f) => +s.features[f].toFixed(6)), ruleChurnScore(s).score, s.count14 > 0 ? 1 : 0, b.category, b.district, label];
    lines.push(row.join(","));
  }
}

mkdirSync(OUT.slice(0, OUT.lastIndexOf("/")), { recursive: true });
writeFileSync(OUT, lines.join("\n") + "\n");
console.log(`Wrote ${OUT}: ${lines.length - 1} rows from ${snapshots} snapshots, ${positives} positive (${((positives / (lines.length - 1)) * 100).toFixed(1)}%).`);
