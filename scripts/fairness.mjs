#!/usr/bin/env node
/**
 * Fairness check: do churn and anomaly flags skew by district, category or
 * size? Runs the app's own scoring on the large synthetic dataset.
 *
 *   node --max-old-space-size=8192 scripts/fairness.mjs     → ml/reports/fairness.{json,md}, and the
 *                                                             fairness section of docs/evaluation.md
 *
 * Churn: the merchants and snapshots the model never saw in training (the same
 * test split as ml/train.py), scored by merchantChurnRisk exactly as the admin
 * page does. A flag is MEDIUM or HIGH. Per group: how often merchants are
 * flagged next to how often they actually churned, and the error rates that
 * matter for fairness — recall (churners caught) and false-positive rate
 * (merchants who stayed but were flagged). The old rule score is shown beside it.
 *
 * Anomalies: every agent at three dates inside the period the generator planted
 * patterns in (10 agents, chosen at random regardless of district or size). Per
 * group: flag rate, planted patterns caught, and flags on agents with no
 * planted pattern. VOLUME_SPIKE is left out: it describes volume, not conduct.
 *
 * Rates come with 95% Wilson intervals. Small groups give wide intervals;
 * read the counts, not just the rates.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { importSrc } from "./lib/synthetic-db.mjs";
import { readSynthetic, toDbState } from "./lib/synthetic-state.mjs";

const SEED = 20261008; // ml/train.py
const TEST_SNAPSHOTS = 8;
const DAY = 86_400_000;

const { merchantChurnRisk, agentIntelligence } = await importSrc("src/services/mock/intelligence/index.ts");

const data = readSynthetic("data/large/synthetic.json");
const { db, now: END } = toDbState(data);
const FIRST = Date.parse(data.meta.firstDay);

/* ───────────── Helpers ───────────── */

function wilson(k, n) {
  if (!n) return [0, 0];
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
const rate = (k, n) => ({ k, n, rate: n ? k / n : null, ci95: wilson(k, n) });
const bucket = (id) => parseInt(createHash("md5").update(`${SEED}:${id}`).digest("hex").slice(0, 8), 16) % 100;
const terciles = (values) => {
  const s = [...values].sort((a, b) => a - b);
  return [s[Math.floor(s.length / 3)], s[Math.floor((2 * s.length) / 3)]];
};
const sizeOf = (v, [a, b]) => (v < a ? "small" : v < b ? "medium" : "large");

/* ───────────── Churn ───────────── */

const csv = readFileSync("data/churn/features.csv", "utf8").trim().split("\n");
const header = csv[0].split(",");
const col = Object.fromEntries(header.map((h, i) => [h, i]));
const rows = csv.slice(1).map((l) => l.split(","));
const days = [...new Set(rows.map((r) => +r[col.snapshot_day]))].sort((a, b) => a - b);
const testDays = new Set(days.slice(-TEST_SNAPSHOTS));
const test = rows.filter((r) => testDays.has(+r[col.snapshot_day]) && bucket(r[col.merchant_id]) < 30);
const sizeCuts = terciles(test.map((r) => +r[col.log_payments_60]));

const scored = test.map((r) => {
  const snapshot = FIRST + +r[col.snapshot_day] * DAY + 12 * 3_600_000;
  const risk = merchantChurnRisk(db, r[col.merchant_id], snapshot);
  return {
    label: +r[col.label],
    model: risk.level !== "LOW",
    modelHigh: risk.level === "HIGH",
    rule: +r[col.rule_score] >= 35,
    method: risk.method,
    district: r[col.district],
    category: r[col.category],
    size: sizeOf(+r[col.log_payments_60], sizeCuts),
  };
});

function churnGroups(by) {
  const groups = {};
  for (const x of scored) (groups[x[by]] ??= []).push(x);
  return Object.entries(groups)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([group, xs]) => {
      const churned = xs.filter((x) => x.label);
      const stayed = xs.filter((x) => !x.label);
      return {
        group,
        rows: xs.length,
        churned: rate(churned.length, xs.length),
        flagged: rate(xs.filter((x) => x.model).length, xs.length),
        recall: rate(churned.filter((x) => x.model).length, churned.length),
        falsePositive: rate(stayed.filter((x) => x.model).length, stayed.length),
        ruleRecall: rate(churned.filter((x) => x.rule).length, churned.length),
        ruleFalsePositive: rate(stayed.filter((x) => x.rule).length, stayed.length),
      };
    });
}

/* ───────────── Anomalies ───────────── */

const truth = data.truth.agents;
const agentDates = [END, END - 7 * DAY, END - 14 * DAY];
const agentRows = [];
for (const at of agentDates) {
  const list = agentIntelligence(db, at);
  const volumes = list.map((a) => a.transactions28);
  const cuts = terciles(volumes);
  for (const a of list) {
    const flags = a.flags.filter((f) => f.code !== "VOLUME_SPIKE");
    agentRows.push({ at, district: a.district, size: sizeOf(a.transactions28, cuts), planted: truth[a.userId]?.anomaly ?? null, flagged: flags.length > 0, caught: !!truth[a.userId]?.anomaly && flags.some((f) => f.code === truth[a.userId].anomaly) });
  }
}
function agentGroups(by) {
  const groups = {};
  for (const x of agentRows) (groups[x[by]] ??= []).push(x);
  return Object.entries(groups)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([group, xs]) => {
      const planted = xs.filter((x) => x.planted);
      const clean = xs.filter((x) => !x.planted);
      return {
        group,
        rows: xs.length,
        flagged: rate(xs.filter((x) => x.flagged).length, xs.length),
        plantedCaught: rate(planted.filter((x) => x.caught).length, planted.length),
        falseFlag: rate(clean.filter((x) => x.flagged).length, clean.length),
      };
    });
}

/* ───────────── Report ───────────── */

for (const x of [...scored, ...agentRows]) x.all = "all";
const report = {
  churn: {
    rows: scored.length,
    scoredByModel: scored.filter((x) => x.method === "MODEL").length,
    overall: churnGroups("all")[0],
    district: churnGroups("district"),
    category: churnGroups("category"),
    size: churnGroups("size"),
  },
  anomalies: {
    dates: agentDates.map((d) => new Date(d).toISOString().slice(0, 10)),
    agents: Object.keys(truth).length,
    planted: Object.values(truth).filter((a) => a.anomaly).length,
    overall: agentGroups("all")[0],
    district: agentGroups("district"),
    size: agentGroups("size"),
  },
};

const pct = (r) => (r.rate === null ? "—" : `${(r.rate * 100).toFixed(1)}%`);
const withCi = (r) => (r.rate === null ? "— (0)" : `${pct(r)} (${(r.ci95[0] * 100).toFixed(0)}–${(r.ci95[1] * 100).toFixed(0)}%, n=${r.n})`);

function spread(groups, key, minN) {
  const ok = groups.filter((g) => g[key].n >= minN && g[key].rate !== null);
  if (ok.length < 2) return null;
  const lo = ok.reduce((a, b) => (b[key].rate < a[key].rate ? b : a));
  const hi = ok.reduce((a, b) => (b[key].rate > a[key].rate ? b : a));
  const overlap = hi[key].ci95[0] <= lo[key].ci95[1];
  return { lo, hi, overlap };
}

const md = [];
md.push(`_Generated by \`scripts/fairness.mjs\` on the large synthetic dataset. **Synthetic data**: the generator gives district no effect on churn and plants agent patterns at random, so a fair method should show no district skew; category and size do change churn risk by design._`, "");
md.push(`#### Churn flags (MEDIUM or HIGH) — ${report.churn.rows} test rows (merchants and snapshots not used in training)`, "");
for (const [title, groups] of [["District", report.churn.district], ["Category", report.churn.category], ["Size (payments in the last 60 days, terciles)", report.churn.size]]) {
  md.push(`| ${title} | Rows | Actually churned | Flagged | Recall (95% CI) | False-positive rate (95% CI) | Rule score: recall / FPR |`, "|---|---|---|---|---|---|---|");
  for (const g of groups) md.push(`| ${g.group} | ${g.rows} | ${pct(g.churned)} | ${pct(g.flagged)} | ${withCi(g.recall)} | ${withCi(g.falsePositive)} | ${pct(g.ruleRecall)} / ${pct(g.ruleFalsePositive)} |`);
  const fpr = spread(groups, "falsePositive", 50);
  const rec = spread(groups, "recall", 10);
  const notes = [];
  if (fpr) notes.push(`false-positive rate ranges from ${pct(fpr.lo.falsePositive)} (${fpr.lo.group}) to ${pct(fpr.hi.falsePositive)} (${fpr.hi.group}); intervals ${fpr.overlap ? "overlap" : "do **not** overlap"}`);
  if (rec) notes.push(`recall ranges from ${pct(rec.lo.recall)} (${rec.lo.group}) to ${pct(rec.hi.recall)} (${rec.hi.group}) among groups with 10+ churners; intervals ${rec.overlap ? "overlap" : "do **not** overlap"}`);
  md.push("", notes.length ? `${title}: ${notes.join("; ")}.` : `${title}: groups too small to compare.`, "");
}
md.push(`Overall: recall ${withCi(report.churn.overall.recall)}, false-positive rate ${withCi(report.churn.overall.falsePositive)}.`, "");
md.push(`#### Agent pattern flags — ${report.anomalies.agents} agents × ${report.anomalies.dates.length} dates (${report.anomalies.dates.join(", ")}), ${report.anomalies.planted} with a planted pattern`, "");
for (const [title, groups] of [["District", report.anomalies.district], ["Outlet size (transactions in 28 days, terciles)", report.anomalies.size]]) {
  md.push(`| ${title} | Agent-dates | Flagged | Planted patterns caught | Flags with no planted pattern (95% CI) |`, "|---|---|---|---|---|");
  for (const g of groups) md.push(`| ${g.group} | ${g.rows} | ${pct(g.flagged)} | ${withCi(g.plantedCaught)} | ${withCi(g.falseFlag)} |`);
  md.push("");
}
md.push(`Overall: planted patterns caught ${withCi(report.anomalies.overall.plantedCaught)}; flags on agents with no planted pattern ${withCi(report.anomalies.overall.falseFlag)}. With ${report.anomalies.planted} planted agents, the per-group "caught" counts are too small to show or rule out a skew.`, "");
const text = md.join("\n") + "\n";

mkdirSync("ml/reports", { recursive: true });
writeFileSync("ml/reports/fairness.json", JSON.stringify(report, null, 1) + "\n");
writeFileSync("ml/reports/fairness.md", text);
try {
  const doc = readFileSync("docs/evaluation.md", "utf8");
  const [start, end] = ["<!-- fairness:start -->", "<!-- fairness:end -->"];
  if (doc.includes(start) && doc.includes(end)) writeFileSync("docs/evaluation.md", doc.slice(0, doc.indexOf(start) + start.length) + "\n" + text + doc.slice(doc.indexOf(end)));
} catch {
  // no docs/evaluation.md yet
}
console.log(text);
