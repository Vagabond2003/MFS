/**
 * Bengali translation coverage: which translatable English strings have no
 * entry in src/lib/i18n/dict/bn-*.ts. Used by scripts/check-i18n.mjs and the
 * tests (tests/i18n.test.ts); see that script for what counts as translatable.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SRC = join(ROOT, "src");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

const unescape = (s) => s.replace(/\\(["'`\\])/g, "$1").replace(/\\n/g, "\n");

/** String literals in source order: { quote, raw, index }. Skips comments and regex-free code well enough for this codebase. */
function stringLiterals(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  const readTemplate = (start) => {
    // src[start] === "`"; returns end index (after closing backtick)
    let j = start + 1;
    while (j < n && src[j] !== "`") {
      if (src[j] === "\\") j += 2;
      else if (src[j] === "$" && src[j + 1] === "{") {
        let depth = 1;
        j += 2;
        while (j < n && depth) {
          const c = src[j];
          if (c === "{") depth++;
          else if (c === "}") depth--;
          else if (c === '"' || c === "'") {
            const q = c;
            j++;
            while (j < n && src[j] !== q) j += src[j] === "\\" ? 2 : 1;
          } else if (c === "`") j = readTemplate(j) - 1;
          j++;
        }
      } else j++;
    }
    return j + 1;
  };
  while (i < n) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") i++;
    } else if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end < 0 ? n : end + 2;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      out.push({ quote: c, raw: src.slice(i + 1, j), index: i });
      i = j + 1;
    } else if (c === "`") {
      const end = readTemplate(i);
      out.push({ quote: "`", raw: src.slice(i + 1, end - 1), index: i });
      i = end;
    } else i++;
  }
  return out;
}

/** Internal messages that never reach a user (developer errors, IDs). */
const IGNORE = [/^Ledger invariant/, /^API handlers must/, /^No database backend/, /^Amount must be a positive whole number of poisha/, /^[A-Z_]+_\{\}$/, /^kyc_/, /^, value:/, /^Wallet not found$/,
  // Device/browser descriptions for the sessions list are shown as recorded.
  /^(?:\{\} on \{\}|Chrome|Firefox|Safari|Edge|Browser|Android|Windows|Linux|Unknown OS|Unknown device|Dhaka, BD \(approx\.\))$/,
  // Developer-facing transport errors.
  /^(?:Server API is disabled in this mode\.|Malformed request\.|Unknown API method\.|Missing idempotency key\.|Unsupported operation\.|Unknown operation\.|Unknown decision\.|Unexpected server response \(\{\}\)\.)$/];
const skeleton = (s) => s.replace(/\$\{[^}]*\}/g, "{}").replace(/\{\w+\}/g, "{}");

/* ───────────── Bengali dictionary keys ───────────── */

const DICT = join(SRC, "lib/i18n/dict");
const bnSource = readdirSync(DICT).map((f) => readFileSync(join(DICT, f), "utf8")).join("\n");
const bnKeys = new Set();
for (const m of bnSource.matchAll(/^\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*:/gm)) bnKeys.add(unescape(m[1].slice(1, -1)));
const bnSkeletons = new Set([...bnKeys].map(skeleton));

/* ───────────── Collect keys ───────────── */


function add(found, key, file, index, source) {
  if (!key || !/[A-Za-z]/.test(key)) return;
  if (found.has(key)) return;
  const line = source.slice(0, index).split("\n").length;
  found.set(key, `${relative(ROOT, file)}:${line}`);
}

const STR = String.raw`"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|\x60((?:[^\x60\\]|\\.)*)\x60`;
const uiCall = new RegExp(String.raw`(?<![\w.])(?:t|msg|titled)\(\s*(?:${STR})`, "g");

const SERVER = [/src\/services\/mock\//, /src\/services\/providers\//, /src\/lib\/validation\.ts$/, /src\/app\/api\//, /src\/services\/errors\.ts$/, /src\/services\/rpc\//];
// Literals in these positions are user-facing on the server side.
const serverContexts = [
  /new ApiError\(\s*"[A-Z_]+",\s*$/,
  /notify(?:Parties)?\([^;]*?,\s*$/,
  /\b(?:label|value|title|body|description|reason|otpReason|note|message|error|name|accountLabel|period|destination|failureReason|reviewNote|settlementAccount)\s*:\s*(?:[^,{}]*\?\s*)?(?:[^,{}]*:\s*)?$/,
  /\.(?:min|max|regex|refine|length|pipe|email)\([^()]*,\s*$/,
  /\b(?:warnings|extraRows|summary)\.push\(\s*(?:\{[^}]*)?$/,
  /\breturn\s+$/,
  /\bthrow\s+new\s+Error\(\s*$/,
  /\?\s*$/,
  /:\s*$/,
];

/**
 * Scans src/ and returns every translatable string (key → first location, "file:line")
 * and the ones with no Bengali entry, as [key, location] pairs.
 */
export function i18nCoverage() {
  const found = new Map(); // key → first location
  for (const file of walk(SRC)) {
    const rel = relative(ROOT, file);
    if (rel.includes("lib/i18n/")) continue;
    const source = readFileSync(file, "utf8");

    for (const m of source.matchAll(uiCall)) add(found, unescape(m[1] ?? m[2] ?? m[3]), file, m.index, source);

    if (!SERVER.some((re) => re.test(rel))) continue;
    for (const lit of stringLiterals(source)) {
      const value = unescape(lit.raw);
      // Prose only: has a lowercase letter and either a space or a leading capital.
      if (!/[a-z]/.test(value) || !/^[A-Z৳$]|\s/.test(value)) continue;
      if (/^[a-z_./@-]+$/i.test(value) && !/\s/.test(value) && !/^[A-Z][a-z]+$/.test(value)) continue;
      const staticText = value.replace(/\$\{[^}]*\}/g, "");
      if (/[{};=]/.test(staticText) || !/[a-z]/.test(staticText)) continue;
      const before = source.slice(Math.max(0, lit.index - 160), lit.index);
      const lineStart = before.slice(before.lastIndexOf("\n") + 1);
      if (/^\s*(?:import|export \* from)/.test(lineStart)) continue;
      if (!serverContexts.some((re) => re.test(before))) continue;
      const key = lit.quote === "`" ? skeleton(value) : value;
      if (IGNORE.some((re) => re.test(key))) continue;
      add(found, key, file, lit.index, source);
    }
  }
  const missing = [...found].filter(([key]) => !bnKeys.has(key) && !bnSkeletons.has(skeleton(key)));
  return { found, missing };
}
