import { ai } from "./dict/bn-ai";
import { app } from "./dict/bn-app";
import { common } from "./dict/bn-common";
import { patterns } from "./dict/bn-patterns";
import { publicSite } from "./dict/bn-public";
import { server } from "./dict/bn-server";

/**
 * Bengali translations, keyed by the English source text.
 * Check coverage with `node scripts/check-i18n.mjs`.
 */
export const BN: Record<string, string> = { ...common, ...publicSite, ...app, ...server, ...ai, ...patterns };

/** Server-made text with embedded values, matched in order (see dict/bn-patterns.ts). */
export const BN_PATTERNS: Record<string, string> = patterns;
