import { z } from "zod";

/**
 * Output checks for model replies. A reply is used only if it is valid JSON,
 * matches the expected shape, and every number in its text already appears in
 * the facts it was given (Bengali digits count the same as Latin ones). Any
 * failure counts as the model not answering, and the next model is tried.
 */

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const toLatinDigits = (s: string) => s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));

/** Numbers in a text, normalised ("12,500" → "12500", "4.50" → "4.5"). */
export function numbersIn(text: string): string[] {
  return [...toLatinDigits(text).matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => String(Number(m[0].replace(/,/g, ""))));
}

/** Small counts the wording may use freely ("3 tips", "next 7 days"). */
const ALWAYS_ALLOWED = new Set(Array.from({ length: 11 }, (_, i) => String(i)));

export function inventedNumbers(output: string, facts: unknown): string[] {
  const allowed = new Set([...ALWAYS_ALLOWED, ...numbersIn(JSON.stringify(facts))]);
  return [...new Set(numbersIn(output).filter((n) => !allowed.has(n)))];
}

/** Model replies sometimes wrap JSON in a code fence or add a sentence around it. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = (fenced ?? text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object");
  return JSON.parse(candidate.slice(start, end + 1));
}

/**
 * Insight text never needs to mention credentials; a reply that does has been
 * steered (e.g. by a prompt injection) into asking for them. English and Bengali.
 */
export const CREDENTIAL_WORDS = /\b(?:pin|pins|password|passwords|passcode|otp|cvv|one[- ]time (?:code|password))\b|পিন|পাসওয়ার্ড|ওটিপি|গোপন কোড/i;

/** Plain sentence(s): no markup, no links, no credentials, bounded length. */
const prose = (max: number) =>
  z
    .string()
    .trim()
    .min(8)
    .max(max)
    .refine((s) => !/[<>`]|https?:\/\/|www\.|\*\*/.test(s), "no markup or links")
    .refine((s) => !CREDENTIAL_WORDS.test(s), "no credentials");

export const textOutput = z.object({ text: prose(420) }).strict();
export const recommendationsOutput = z
  .object({
    items: z.array(z.object({ title: prose(90), detail: prose(320) }).strict()).min(1).max(3),
  })
  .strict();

export type TextOutput = z.infer<typeof textOutput>;
export type RecommendationsOutput = z.infer<typeof recommendationsOutput>;

/** Throws when the reply can't be used. */
export function validateReply<T>(schema: z.ZodType<T>, reply: string, facts: unknown, expectedItems?: number): T {
  const parsed = schema.parse(extractJson(reply));
  const strings: string[] = [];
  const collect = (v: unknown) => {
    if (typeof v === "string") strings.push(v);
    else if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === "object") Object.values(v).forEach(collect);
  };
  collect(parsed);
  const invented = inventedNumbers(strings.join(" \n "), facts);
  if (invented.length) throw new Error(`numbers not in the facts: ${invented.join(", ")}`);
  if (expectedItems !== undefined) {
    const items = (parsed as { items?: unknown[] }).items;
    if (!items || items.length !== expectedItems) throw new Error(`expected ${expectedItems} items`);
  }
  return parsed;
}
