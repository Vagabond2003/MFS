#!/usr/bin/env node
/**
 * Bengali translation coverage check.
 *
 *   node scripts/check-i18n.mjs          → lists English strings with no Bengali entry
 *   node scripts/check-i18n.mjs --all    → lists every translatable string found
 *
 * Collects:
 *   - UI keys:      t("…"), msg("…")
 *   - Server text:  user-facing literals in the API handlers, policy, providers and
 *                   shared validation (error messages, notifications, quote rows…).
 *                   Template literals become patterns: `Sent to ${x}` → "Sent to {}".
 * A key is covered when src/lib/i18n/dict/bn-*.ts has it, or a pattern with the same shape.
 */
import { i18nCoverage } from "./lib/i18n-coverage.mjs";

const { found, missing } = i18nCoverage();
const all = process.argv.includes("--all");
const rows = all ? [...found] : missing;
for (const [key, where] of rows.sort((a, b) => a[1].localeCompare(b[1]))) console.log(`${where}\t${JSON.stringify(key)}`);
console.error(`\n${found.size} translatable strings · ${found.size - missing.length} translated · ${missing.length} missing`);
process.exit(!all && missing.length ? 1 : 0);
