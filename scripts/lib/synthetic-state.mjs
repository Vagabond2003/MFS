/**
 * The synthetic dataset (scripts/seed-synthetic.mjs) as an in-memory DbState,
 * without a database. Used by the tests and by scripts/check-ai.mjs.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const GENERATOR = fileURLToPath(new URL("../seed-synthetic.mjs", import.meta.url));

/**
 * Generates the dataset offline and returns the emitted JSON. With `now` (an
 * ISO date-time) the 90 days of history end at that instant, so the same
 * anchor always gives the same data; without it they end at the current time.
 */
export function generateSynthetic({ now } = {}) {
  const file = join(mkdtempSync(join(tmpdir(), "kosh-synthetic-")), "synthetic.json");
  const args = [GENERATOR, "--offline", `--emit=${file}`, ...(now ? [`--now=${now}`] : [])];
  execFileSync(process.execPath, args, { stdio: "pipe" });
  return JSON.parse(readFileSync(file, "utf8"));
}

/**
 * Reads a dataset written by `seed-synthetic.mjs --emit=FILE` or
 * `generate-large.mjs` (whose transactions are in a gzipped JSON-lines file beside it).
 */
export function readSynthetic(file) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  if (data.transactionsFile) data.transactions = readJsonLines(join(dirname(file), data.transactionsFile));
  return data;
}

/** JSON lines (gzipped when the name ends in .gz), decoded in slices: the whole file can be too large for one string. */
function readJsonLines(file) {
  const raw = readFileSync(file);
  const buf = file.endsWith(".gz") ? gunzipSync(raw) : raw;
  const out = [];
  const step = 32 * 1024 * 1024;
  for (let start = 0; start < buf.length; ) {
    let end = Math.min(buf.length, start + step);
    if (end < buf.length) end = buf.indexOf(10, end) + 1 || buf.length; // finish the line
    for (const line of buf.toString("utf8", start, end).split("\n")) if (line) out.push(JSON.parse(line));
    start = end;
  }
  return out;
}

/** Emitted JSON → { db, now, specials }, where `now` is the instant the history ends. */
export function toDbState(data) {
  const db = {
    version: 5,
    seededAt: data.generatedAt,
    users: [...data.users, ...data.demoRecords.users],
    personalProfiles: data.personalProfiles,
    agentProfiles: [...data.agentProfiles, ...data.demoRecords.agentProfiles],
    merchantProfiles: data.merchantProfiles,
    merchantBusinesses: [...data.merchantBusinesses, ...data.demoRecords.merchantBusinesses],
    statusHistory: data.statusHistory,
    documents: [],
    wallets: [...data.wallets, ...data.demoRecords.wallets],
    transactions: data.transactions,
    commissions: data.commissions,
    notifications: [],
    otpCodes: [],
    sessions: [],
    auditLogs: [],
    disputes: [],
    paymentRequests: [],
    aiInsights: [],
    rateLimits: {},
    idempotency: {},
  };
  return { db, now: Date.parse(data.generatedAt), specials: data.specials };
}
