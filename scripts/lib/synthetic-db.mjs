/**
 * Setup for scripts that run the app's code outside the test runner
 * (check-ai.mjs, churn-dataset.mjs, fairness.mjs):
 *   - lets Node import the app's TypeScript directly (type stripping), with
 *     small hooks that map "@/", extensionless and JSON imports the way the
 *     Next.js bundler does;
 *   - builds an in-memory DbState from the synthetic dataset.
 * The tests (npm test) don't use this file; Vitest resolves the imports itself.
 */
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { generateSynthetic, readSynthetic, toDbState } from "./synthetic-state.mjs";

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
      }
      // The app imports JSON the bundler way (no import attribute); Node needs one.
      export async function load(url, context, next) {
        if (url.endsWith(".json")) return next(url, { ...context, importAttributes: { ...context.importAttributes, type: "json" } });
        return next(url, context);
      }`),
);

/** Import a module from src/ by its path relative to the project root. */
export const importSrc = (path) => import(pathToFileURL(fileURLToPath(new URL(path, ROOT))).href);

/**
 * The synthetic dataset as a DbState. Generates it offline (history ending now)
 * unless FILE (written by `seed-synthetic.mjs --emit=FILE`) is given.
 * Returns { db, now, specials }.
 */
export function loadSyntheticDb(file) {
  return toDbState(file ? readSynthetic(file) : generateSynthetic());
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
