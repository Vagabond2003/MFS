import { createHash } from "node:crypto";
import type { Lang } from "@/lib/i18n/core";
import { recordAiNote } from "@/server/db-store";
import { randomId } from "@/services/mock/crypto";
import { dhakaDay } from "@/services/mock/intelligence/common";
import type { DbState } from "@/services/mock/schema";
import type { AiMeta } from "@/types/domain";
import { explain, type Explanation } from "./explain";
import type { FactsOf, InsightKind, OutputOf } from "./kinds";
import { configuredModels } from "./providers";

/**
 * Wording for an insight, with a per-user daily cache (ai_insights) and a
 * per-user budget of model calls (rate_limits).
 *
 *   1. planNote()    — inside the handler's read(): finds today's cached
 *                      wording for exactly these facts, and checks the budget.
 *   2. resolveNote() — after the read: returns the cached wording, or asks the
 *                      models (outside any transaction, so a slow model never
 *                      holds the database lock), then stores the result.
 */

/** Model calls per user per hour; cached wording doesn't count. */
const AI_CALLS_PER_HOUR = 30;
const HOUR_MS = 3_600_000;
const rateKey = (userId: string) => `ai:${userId}`;

export type AiNote<K extends InsightKind> = OutputOf<K> & AiMeta;

export interface NotePlan<K extends InsightKind> {
  userId: string;
  kind: K;
  facts: FactsOf<K>;
  lang: Lang;
  hash: string;
  cached: AiNote<K> | null;
  limited: boolean;
}

export function planNote<K extends InsightKind>(db: DbState, userId: string, kind: K, facts: FactsOf<K>, lang: Lang): NotePlan<K> {
  const hash = createHash("sha256").update(JSON.stringify({ kind, lang, facts })).digest("hex");
  const today = dhakaDay(Date.now());
  const hit = (db.aiInsights ?? []).find(
    (r) => r.userId === userId && r.kind === kind && r.language === lang && r.inputHash === hash && dhakaDay(Date.parse(r.createdAt)) === today,
  );
  const bucket = db.rateLimits[rateKey(userId)];
  return {
    userId,
    kind,
    facts,
    lang,
    hash,
    cached: hit ? ({ ...(hit.payload as OutputOf<K>), source: "AI", model: hit.model, generatedAt: hit.createdAt, language: lang } as AiNote<K>) : null,
    limited: !!bucket && bucket.resetAt > Date.now() && bucket.count >= AI_CALLS_PER_HOUR,
  };
}

/** Same facts requested twice at once (e.g. a card and a page) share one model call. */
const g = globalThis as unknown as { __koshAiInflight?: Map<string, Promise<Explanation<unknown>>> };
const inflight = (g.__koshAiInflight ??= new Map());

export async function resolveNote<K extends InsightKind>(plan: NotePlan<K>): Promise<AiNote<K>> {
  if (plan.cached) return plan.cached;
  const generatedAt = () => new Date().toISOString();
  if (plan.limited || !configuredModels().length) {
    const t = await explainTemplateOnly(plan);
    return { ...t.output, source: t.source, model: t.model, generatedAt: generatedAt(), language: plan.lang } as AiNote<K>;
  }

  const key = `${plan.userId}:${plan.hash}`;
  let pending = inflight.get(key) as Promise<Explanation<OutputOf<K>>> | undefined;
  if (!pending) {
    pending = explain(plan.kind, plan.facts, plan.lang).then(async (result) => {
      await remember(plan, result).catch((e) => console.warn("[ai] could not save wording:", e instanceof Error ? e.message : e));
      return result;
    });
    inflight.set(key, pending);
    pending.finally(() => inflight.delete(key)).catch(() => undefined);
  }
  const result = await pending;
  return { ...result.output, source: result.source, model: result.model, generatedAt: generatedAt(), language: plan.lang } as AiNote<K>;
}

/** Template wording without touching any model (budget used up, or no keys configured). */
function explainTemplateOnly<K extends InsightKind>(plan: NotePlan<K>) {
  return explain(plan.kind, plan.facts, plan.lang, { models: [] });
}

/**
 * Counts the model calls against the user's budget and caches model wording
 * for the rest of the day. A small targeted write (see recordAiNote), so a
 * cache entry never holds the app-wide write lock for a full database load.
 */
async function remember<K extends InsightKind>(plan: NotePlan<K>, result: Explanation<OutputOf<K>>) {
  if (!result.attempts) return;
  await recordAiNote({
    rateKey: rateKey(plan.userId),
    limit: AI_CALLS_PER_HOUR,
    windowMs: HOUR_MS,
    note:
      result.source === "AI"
        ? {
            id: randomId("ain"),
            userId: plan.userId,
            kind: plan.kind,
            language: plan.lang,
            inputHash: plan.hash,
            payload: { ...result.output },
            model: result.model ?? "unknown",
            createdAt: new Date().toISOString(),
          }
        : null,
  });
}
