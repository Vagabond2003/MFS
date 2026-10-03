import type { ZodType } from "zod";
import { translator, type Lang } from "@/lib/i18n/core";
import { validateReply } from "./guard";
import { KINDS, schemaFor, type FactsOf, type InsightKind, type OutputOf, type RecommendationFacts } from "./kinds";
import { available, callModel, configuredModels, coolDown, ModelError, type ModelSpec } from "./providers";

/**
 * explain(kind, facts, lang): put already-computed figures into words.
 *
 * Tries each configured model in order within one shared deadline, keeping
 * enough time back for the next model. A reply counts only if it is valid JSON
 * of the expected shape, in the requested language, and uses no number that
 * isn't in the facts. Otherwise — or with no keys configured — the
 * deterministic template answers, so every insight works without a model.
 */

export interface Explanation<O> {
  output: O;
  source: "AI" | "TEMPLATE";
  /** Model that wrote the text; null for the template. */
  model: string | null;
  /** Model calls made (0 when the template answered without trying one). */
  attempts: number;
}

/** Longest a request waits for wording before using the template. */
const DEADLINE_MS = 18_000;
/** Time kept back for each later model, so a slow first model can't starve the rest. */
const RESERVE_MS = 5_000;
/** Below this an attempt isn't worth starting. */
const MIN_ATTEMPT_MS = 2_500;

const AUDIENCE = {
  agent: "a Kosh agent: a shop owner who gives customers Cash In (customer hands over cash, agent sends e-money) and Cash Out (customer sends e-money, agent hands over cash). Cash Out uses up the agent's cash in hand; Cash In uses up the agent's e-money float. Agents earn commission on each transaction",
  merchant: "a Kosh merchant: a shop or business that takes payments from customers' Kosh wallets by QR code or merchant number",
  admin: "the Kosh operations team, who review the agent and merchant network",
} as const;

function systemPrompt(audience: keyof typeof AUDIENCE, lang: Lang) {
  const language = lang === "bn" ? "Bengali (বাংলা), in plain everyday words" : "plain English";
  return [
    "You write short insight notes for Kosh, a mobile financial service (mobile wallet) in Bangladesh.",
    `The reader is ${AUDIENCE[audience]}.`,
    "Rules:",
    "- Use only the facts you are given. Every figure has already been calculated: copy amounts and percentages exactly as written. Do not calculate, round, convert or estimate new numbers.",
    "- Do not mention people, phone numbers, account names or IDs.",
    "- The only money actions you may suggest are the ones listed in the facts. Never ask anyone to send, transfer or share money, PINs or codes.",
    "- Write natural sentences for a busy reader. Never repeat JSON key names or topic codes.",
    "- Be specific and practical. No greetings, no markdown, no links, no emojis.",
    `- Write in ${language}. Keep every number in Latin digits exactly as given, amounts with the ৳ sign (e.g. ৳15,000, 37%).`,
    "- Reply with one JSON object only, exactly in the requested shape.",
  ].join("\n");
}

function userPrompt(task: string, shape: string, facts: unknown) {
  return `${task}\n\nFacts (JSON):\n${JSON.stringify(facts, null, 1)}\n\nReply with JSON of this shape: ${shape}`;
}

const TEXT_SHAPE = '{"text": "<one or two sentences, at most 400 characters>"}';
const itemsShape = (n: number) => `{"items": [${n} objects like {"title": "<at most 8 words>", "detail": "<1–2 sentences>"}]}`;

/** Bengali letters (not ৳ or digits, which English text uses too). */
const BENGALI_LETTERS = /[\u0985-\u09B9]/;

export async function explain<K extends InsightKind>(
  kind: K,
  facts: FactsOf<K>,
  lang: Lang,
  opts: { models?: ModelSpec[] } = {},
): Promise<Explanation<OutputOf<K>>> {
  const def = KINDS[kind];
  let attempts = 0;
  const template = (): Explanation<OutputOf<K>> => ({
    output: (def.template as (f: FactsOf<K>, t: ReturnType<typeof translator>, l: Lang) => OutputOf<K>)(facts, translator(lang), lang),
    source: "TEMPLATE",
    model: null,
    attempts,
  });

  const nothingToSay = (def as { nothingToSay?: (f: FactsOf<K>) => boolean }).nothingToSay;
  if (nothingToSay?.(facts)) return template();
  const expectedItems = def.output === "recommendations" ? (facts as RecommendationFacts).signals.length : undefined;

  const models = opts.models ?? configuredModels();
  const system = systemPrompt(def.audience, lang);
  const prompt = userPrompt(def.task, expectedItems === undefined ? TEXT_SHAPE : itemsShape(expectedItems), facts);
  const started = Date.now();

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    if (!available(model)) continue;
    const later = models.slice(i + 1).filter((m) => available(m)).length;
    const budget = Math.min(model.timeoutMs, DEADLINE_MS - (Date.now() - started) - later * RESERVE_MS);
    if (budget < MIN_ATTEMPT_MS) continue;
    try {
      attempts++;
      const reply = await callModel(model, system, prompt, budget);
      const output = validateReply(schemaFor(kind) as unknown as ZodType<OutputOf<K>>, reply, facts, expectedItems);
      if ((lang === "bn") !== BENGALI_LETTERS.test(JSON.stringify(output))) throw new Error("reply is in the wrong language");
      return { output, source: "AI", model: model.id, attempts };
    } catch (e) {
      const reason = e instanceof ModelError ? e.reason : "invalid";
      // Skip a model for a while after it rate-limits or stalls; a bad reply only costs this request.
      if (reason === "rate-limited") coolDown(model, 60_000);
      else if (reason === "timeout") coolDown(model, 30_000);
      else if (reason === "http") coolDown(model, 15_000);
      console.warn(`[ai] ${kind}: ${model.id} failed (${reason})`);
    }
  }
  return template();
}
