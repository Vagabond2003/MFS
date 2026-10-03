/**
 * Shared setup for the node sanity checks (no test framework, no database):
 *   - lets Node import the app's TypeScript directly (type stripping), with a
 *     small resolve hook that maps "@/" and extensionless imports the way the
 *     Next.js bundler does;
 *   - builds an in-memory DbState from the synthetic dataset.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

process.removeAllListeners("warning");
process.on("warning", (w) => w.code !== "MODULE_TYPELESS_PACKAGE_JSON" && console.warn(w.message));

const ROOT = new URL("../..", import.meta.url);
const SRC = new URL("src/", ROOT).href;
register(
  "data:text/javascript," +
    encodeURIComponent(`
      export async function resolve(specifier, context, next) {
        if (specifier.startsWith("@/")) specifier = ${JSON.stringify(SRC)} + specifier.slice(2);
        try {
          return await next(specifier, context);
        } catch (error) {
          if (!/^(\\.|file:)/.test(specifier) || !["ERR_MODULE_NOT_FOUND", "ERR_UNSUPPORTED_DIR_IMPORT"].includes(error?.code)) throw error;
          for (const ext of [".ts", "/index.ts"]) {
            try { return await next(specifier + ext, context); } catch {}
          }
          throw error;
        }
      }`),
);

/** Import a module from src/ by its path relative to the project root. */
export const importSrc = (path) => import(pathToFileURL(new URL(path, ROOT).pathname).href);

/**
 * The synthetic dataset as a DbState. Generates it offline unless FILE (written
 * by `seed-synthetic.mjs --emit=FILE`) is given.
 * Returns { db, now, specials }.
 */
export function loadSyntheticDb(file) {
  if (!file) {
    file = join(mkdtempSync(join(tmpdir(), "kosh-intel-")), "synthetic.json");
    execFileSync(process.execPath, [new URL("scripts/seed-synthetic.mjs", ROOT).pathname, "--offline", `--emit=${file}`], { stdio: "inherit" });
  }
  const data = JSON.parse(readFileSync(file, "utf8"));
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

/** Tiny assertion helper: check(name, ok, detail) and summary(). */
export function checker() {
  let passes = 0;
  let failures = 0;
  return {
    check(name, ok, detail = "") {
      if (ok) passes++;
      else failures++;
      console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
    },
    summary() {
      console.log(`\n${passes} passed · ${failures} failed`);
      process.exit(failures ? 1 : 0);
    },
  };
}
