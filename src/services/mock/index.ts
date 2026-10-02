import type { ApiClient } from "../contracts";
import { toApiError } from "../errors";
import { admin, dev } from "./handlers/admin";
import { agent, lookup, merchant, notifications, personal, profile, security, transactions, wallet } from "./handlers/account";
import { auth, registration, uploads } from "./handlers/identity";
import { operations } from "./handlers/operations";

/**
 * DEVELOPMENT MOCK API — runs entirely in the browser.
 *
 * It enforces the same rules a real backend must (session resolution, RBAC,
 * verification gates, server-side fees/limits, PIN/OTP, atomic posting,
 * audit logging), so the UI behaves exactly as it would against a server.
 * It is NOT a security boundary: anything in the browser can be modified by
 * the user. Use services/http with a real backend for anything real.
 */

const MIN_LATENCY = 180;
const MAX_LATENCY = 520;

function withLatency<T extends object>(group: T): T {
  const wrapped = {} as T;
  for (const key of Object.keys(group) as (keyof T)[]) {
    const fn = group[key];
    if (typeof fn !== "function") {
      wrapped[key] = fn;
      continue;
    }
    wrapped[key] = (async (...args: unknown[]) => {
      await new Promise((r) => setTimeout(r, MIN_LATENCY + Math.random() * (MAX_LATENCY - MIN_LATENCY)));
      try {
        return await (fn as (...a: unknown[]) => Promise<unknown>).apply(group, args);
      } catch (err) {
        throw toApiError(err);
      }
    }) as T[keyof T];
  }
  return wrapped;
}

export const mockApi: ApiClient = {
  mode: "mock",
  auth: withLatency(auth),
  registration: withLatency(registration),
  uploads: withLatency(uploads),
  wallet: withLatency(wallet),
  operations: withLatency(operations),
  transactions: withLatency(transactions),
  notifications: withLatency(notifications),
  profile: withLatency(profile),
  security: withLatency(security),
  personal: withLatency(personal),
  agent: withLatency(agent),
  merchant: withLatency(merchant),
  lookup: withLatency(lookup),
  admin: withLatency(admin),
  dev: withLatency(dev),
};
