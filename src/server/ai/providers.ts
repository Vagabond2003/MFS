import { GoogleGenAI } from "@google/genai";

/**
 * Model calls. Order: GEMINI_MODEL → GEMINI_FALLBACK_MODEL (Gemini API) →
 * GROQ_MODEL (Groq, OpenAI-compatible, via fetch). Server-only: keys come
 * from the environment and are never logged or sent to the browser.
 *
 * Each model has a per-minute budget kept under its free-tier limit and a
 * short cool-down after a failure, so a slow or rate-limited model is skipped
 * instead of slowing every request.
 */

export interface ModelSpec {
  id: string;
  provider: "gemini" | "groq";
  /** Longest single attempt. */
  timeoutMs: number;
  /** Calls allowed per rolling minute (under the free-tier limit). */
  perMinute: number;
}

export function configuredModels(): ModelSpec[] {
  const models: ModelSpec[] = [];
  if (process.env.GEMINI_API_KEY) {
    if (process.env.GEMINI_MODEL) models.push({ id: process.env.GEMINI_MODEL, provider: "gemini", timeoutMs: 8_000, perMinute: 14 });
    if (process.env.GEMINI_FALLBACK_MODEL) models.push({ id: process.env.GEMINI_FALLBACK_MODEL, provider: "gemini", timeoutMs: 8_000, perMinute: 28 });
  }
  if (process.env.GROQ_API_KEY && process.env.GROQ_MODEL) {
    models.push({ id: process.env.GROQ_MODEL, provider: "groq", timeoutMs: 8_000, perMinute: 25 });
  }
  return models;
}

/* ───────────── Budgets & cool-downs (per server process) ───────────── */

interface AiState {
  calls: Map<string, number[]>;
  coolUntil: Map<string, number>;
  gemini?: GoogleGenAI;
}
const g = globalThis as unknown as { __koshAi?: AiState };
const state: AiState = (g.__koshAi ??= { calls: new Map(), coolUntil: new Map() });

export function available(model: ModelSpec, now = Date.now()) {
  if ((state.coolUntil.get(model.id) ?? 0) > now) return false;
  const recent = (state.calls.get(model.id) ?? []).filter((t) => t > now - 60_000);
  state.calls.set(model.id, recent);
  return recent.length < model.perMinute;
}

export function recordCall(model: ModelSpec, now = Date.now()) {
  state.calls.set(model.id, [...(state.calls.get(model.id) ?? []), now]);
}

export function coolDown(model: ModelSpec, ms: number) {
  state.coolUntil.set(model.id, Date.now() + ms);
}

/** Errors worth telling apart: rate limits and timeouts trigger longer cool-downs. */
export class ModelError extends Error {
  readonly reason: "rate-limited" | "timeout" | "http" | "empty";
  constructor(reason: ModelError["reason"], message: string) {
    super(message);
    this.name = "ModelError";
    this.reason = reason;
  }
}

/* ───────────── Providers ───────────── */

function gemini() {
  return (state.gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));
}

async function callGemini(model: ModelSpec, system: string, prompt: string, signal: AbortSignal) {
  // Gemma models on the Gemini API reject JSON mode; their output is parsed and validated the same way.
  const jsonMode = !model.id.startsWith("gemma");
  try {
    const res = await gemini().models.generateContent({
      model: model.id,
      contents: prompt,
      config: {
        systemInstruction: system,
        temperature: 0.4,
        maxOutputTokens: 900,
        abortSignal: signal,
        ...(jsonMode ? { responseMimeType: "application/json" } : {}),
      },
    });
    return res.text ?? "";
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    if (signal.aborted) throw new ModelError("timeout", "timed out");
    if (/\b429\b|RESOURCE_EXHAUSTED|quota/i.test(text)) throw new ModelError("rate-limited", "rate limited");
    throw new ModelError("http", text.slice(0, 120));
  }
}

async function callGroq(model: ModelSpec, system: string, prompt: string, signal: AbortSignal) {
  let res: Response;
  try {
    res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model.id,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
        max_completion_tokens: 900,
        ...(model.id.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
      }),
      signal,
    });
  } catch {
    throw new ModelError(signal.aborted ? "timeout" : "http", signal.aborted ? "timed out" : "network error");
  }
  if (res.status === 429) throw new ModelError("rate-limited", "rate limited");
  if (!res.ok) throw new ModelError("http", `HTTP ${res.status}`);
  const body = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
  return body?.choices?.[0]?.message?.content ?? "";
}

export async function callModel(model: ModelSpec, system: string, prompt: string, timeoutMs: number) {
  const signal = AbortSignal.timeout(timeoutMs);
  recordCall(model);
  const text = await (model.provider === "gemini" ? callGemini(model, system, prompt, signal) : callGroq(model, system, prompt, signal));
  if (!text.trim()) throw new ModelError("empty", "empty response");
  return text;
}
