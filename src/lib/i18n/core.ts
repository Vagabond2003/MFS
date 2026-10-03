import { BN, BN_PATTERNS } from "./bn";

/**
 * Interface languages. Text is keyed by its English source: `t("Send Money")`
 * looks the string up in the Bengali dictionary (./bn.ts) and falls back to
 * the English text, so a missing translation never breaks a screen.
 *
 * Runs on the server and in the browser — keep it free of React and Node APIs.
 */

export const LANGS = ["en", "bn"] as const;
export type Lang = (typeof LANGS)[number];

export const DEFAULT_LANG: Lang = "en";
/** Readable (non-httpOnly) cookie so the server renders the chosen language. */
export const LANG_COOKIE = "kosh_lang";

/** Each language's name, written in that language. */
export const LANG_NAME: Record<Lang, string> = { en: "English", bn: "বাংলা" };

export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && (LANGS as readonly string[]).includes(value);
}

export type Vars = Record<string, string | number>;
export type Translate = (text: string, vars?: Vars) => string;

/**
 * Marks a string for translation where it is defined (config arrays, label
 * maps) without translating it yet. Render it later with `t(value)`.
 * The key checker (scripts/check-i18n.mjs) picks these up.
 */
export const msg = <T extends string>(text: T) => text;

const interpolate = (text: string, vars: Vars) => text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

/* ───────────── Patterns: translate server text that carries values ───────────── */

interface Pattern {
  re: RegExp;
  names: string[];
  template: string;
}

let patterns: Pattern[] | null = null;
const patternCache = new Map<string, string | null>();

function compilePatterns(): Pattern[] {
  patterns ??= Object.entries(BN_PATTERNS)
    .filter(([key]) => /\{\w+\}/.test(key))
    .map(([key, template]) => {
      const names: string[] = [];
      const source = key
        .split(/(\{\w+\})/)
        .map((part) => {
          const m = /^\{(\w+)\}$/.exec(part);
          if (m) {
            names.push(m[1]);
            return "(.*?)";
          }
          return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        })
        .join("");
      return { re: new RegExp(`^${source}$`, "s"), names, template };
    });
  return patterns;
}

/** "Your application (AG-10001) was received" → its Bengali template with the values put back. */
function matchPattern(text: string): string | null {
  if (patternCache.has(text)) return patternCache.get(text)!;
  let out: string | null = null;
  for (const p of compilePatterns()) {
    const m = p.re.exec(text);
    if (!m) continue;
    const vars: Vars = {};
    p.names.forEach((name, i) => {
      const value = m[i + 1];
      vars[name] = BN[value] ?? value;
    });
    out = interpolate(p.template, vars);
    break;
  }
  if (patternCache.size > 2000) patternCache.clear();
  patternCache.set(text, out);
  return out;
}

export function translate(lang: Lang, text: string, vars?: Vars): string {
  if (!text) return text;
  let out = text;
  if (lang === "bn") out = BN[text] ?? (vars ? text : matchPattern(text) ?? text);
  return vars ? interpolate(out, vars) : out;
}

export const translator =
  (lang: Lang): Translate =>
  (text, vars) =>
    translate(lang, text, vars);

/* ───────────── Month names in server-made labels ("Oct", "3 Oct", "October 2026") ───────────── */

const BN_MONTHS: Record<string, string> = {
  January: "জানুয়ারি", February: "ফেব্রুয়ারি", March: "মার্চ", April: "এপ্রিল", June: "জুন", July: "জুলাই",
  August: "আগস্ট", September: "সেপ্টেম্বর", October: "অক্টোবর", November: "নভেম্বর", December: "ডিসেম্বর",
  Jan: "জানু", Feb: "ফেব্রু", Mar: "মার্চ", Apr: "এপ্রিল", May: "মে", Jun: "জুন",
  Jul: "জুলাই", Aug: "আগস্ট", Sep: "সেপ্টে", Oct: "অক্টো", Nov: "নভে", Dec: "ডিসে",
};
const MONTH_RE = new RegExp(`\\b(${Object.keys(BN_MONTHS).join("|")})\\b`, "g");

export function localizeMonths(lang: Lang, label: string): string {
  if (lang !== "bn") return label;
  return label.replace(MONTH_RE, (m) => BN_MONTHS[m]);
}
