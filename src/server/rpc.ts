import { AsyncLocalStorage } from "node:async_hooks";
import { after, type NextRequest } from "next/server";
import { SESSION_COOKIE, readSessionClaims, type SessionClaims } from "@/lib/auth/session-token";
import { DEFAULT_LANG, LANG_COOKIE, isLang, type Lang } from "@/lib/i18n/core";
import { ApiError, toApiError } from "@/services/errors";
import { admin } from "@/services/mock/handlers/admin";
import { agent, lookup, merchant, notifications, personal, profile, security, transactions, wallet } from "@/services/mock/handlers/account";
import { auth, registration, uploads } from "@/services/mock/handlers/identity";
import { insights } from "@/services/mock/handlers/insights";
import { operations } from "@/services/mock/handlers/operations";
import { setRequestEnvProvider, type OutgoingEmail } from "@/services/mock/runtime";
import { setStoreBackend } from "@/services/mock/store";
import { dbStore } from "./db-store";
import { deliverEmails, emailConfigured } from "./email";
import { deliverSms, smsConfigured } from "./sms";

/**
 * Server-side execution of the API handlers (NEXT_PUBLIC_API_MODE=supabase).
 * The handlers are the same ones the in-browser mock uses — they enforce
 * sessions, roles, limits, PIN/OTP and atomic posting — but here they run on
 * the server against PostgreSQL, so the browser never sees password hashes,
 * other users' data, or the database credentials.
 */

setStoreBackend(dbStore);

/** Exactly the API surface the UI is allowed to call. */
const GROUPS: Record<string, object> = {
  auth,
  registration,
  uploads,
  wallet,
  operations,
  transactions,
  notifications,
  profile,
  security,
  personal,
  agent,
  merchant,
  insights,
  lookup,
  admin,
};

export interface CallContext {
  claims: SessionClaims | null;
  userAgent: string;
  ip: string;
  /** Interface language of the request (from the language cookie). */
  lang: Lang;
  /** Public origin of the request (for links in emails). */
  origin: string;
  /** Emails queued by the call; sent after it succeeds. */
  outbox: OutgoingEmail[];
  /** Text messages queued by the call; sent after it succeeds. */
  smsOutbox: { to: string; message: string }[];
  /** Set when a handler signs the user in or out. */
  cookie: { action: "set"; claims: SessionClaims; remember: boolean } | { action: "clear" } | null;
}

/** The call context for a request: its session, client details and language. */
export async function callContextFor(request: NextRequest): Promise<CallContext> {
  const langCookie = request.cookies.get(LANG_COOKIE)?.value;
  return {
    claims: await readSessionClaims(request.cookies.get(SESSION_COOKIE)?.value),
    userAgent: request.headers.get("user-agent") ?? "",
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "127.0.0.1",
    lang: isLang(langCookie) ? langCookie : DEFAULT_LANG,
    origin: process.env.APP_URL || request.nextUrl.origin,
    outbox: [],
    smsOutbox: [],
    cookie: null,
  };
}

// One request context per process, shared by every hot-reloaded copy of this module.
const g = globalThis as unknown as { __koshCallContext?: AsyncLocalStorage<CallContext> };
const als = (g.__koshCallContext ??= new AsyncLocalStorage<CallContext>());

setRequestEnvProvider(() => {
  const ctx = als.getStore();
  if (!ctx) return undefined;
  return {
    claims: () => ctx.claims,
    setSession: (claims, remember) => {
      ctx.cookie = { action: "set", claims, remember };
      ctx.claims = claims;
    },
    clearSession: () => {
      ctx.cookie = { action: "clear" };
      ctx.claims = null;
    },
    userAgent: () => ctx.userAgent,
    ip: () => ctx.ip,
    lang: () => ctx.lang,
    emailEnabled: emailConfigured,
    queueEmail: (email) => {
      ctx.outbox.push(email);
    },
    smsEnabled: smsConfigured,
    queueSms: (sms) => {
      ctx.smsOutbox.push(sms);
    },
  };
});

export function resolveMethod(group: unknown, method: unknown): ((...args: unknown[]) => Promise<unknown>) | null {
  if (typeof group !== "string" || typeof method !== "string") return null;
  if (!Object.hasOwn(GROUPS, group)) return null;
  const target = GROUPS[group] as Record<string, unknown>;
  if (!Object.hasOwn(target, method) || typeof target[method] !== "function") return null;
  const fn = target[method] as (...args: unknown[]) => Promise<unknown>;
  return (...args) => fn.apply(target, args);
}

export async function runCall(ctx: CallContext, fn: (...args: unknown[]) => Promise<unknown>, args: unknown[]) {
  return als.run(ctx, async () => {
    try {
      const data = await fn(...args);
      // Sent after the call (and its transaction) succeeded, once the response is out. after() keeps
      // serverless functions alive until delivery finishes; problems are logged, not surfaced.
      const emails = ctx.outbox.splice(0);
      const texts = ctx.smsOutbox.splice(0);
      if (emails.length || texts.length) after(() => Promise.all([deliverEmails(emails, ctx.origin), deliverSms(texts)]));
      return { ok: true as const, data };
    } catch (err) {
      if (err instanceof ApiError) return { ok: false as const, error: err };
      // Database or programming error: log it, but don't leak internals to the client.
      console.error("[rpc]", err);
      return { ok: false as const, error: toApiError(new ApiError("UNKNOWN", "Something went wrong. Please try again.")) };
    }
  });
}
