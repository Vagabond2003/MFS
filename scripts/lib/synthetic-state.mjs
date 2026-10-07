/**
 * The synthetic dataset (scripts/seed-synthetic.mjs) as an in-memory DbState,
 * without a database. Used by the tests and by scripts/check-ai.mjs.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

/** Reads a dataset written by `seed-synthetic.mjs --emit=FILE`. */
export function readSynthetic(file) {
  return JSON.parse(readFileSync(file, "utf8"));
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
