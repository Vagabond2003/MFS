import type { ApiClient } from "../contracts";
import { ApiError, type ApiErrorCode } from "../errors";

/**
 * Browser client for NEXT_PUBLIC_API_MODE=supabase. Every method is forwarded
 * to POST /api/rpc, where the real handlers run on the server against the
 * database (see src/server/rpc.ts). The session is an httpOnly cookie the
 * browser sends automatically.
 */

async function call(group: string, method: string, args: unknown[]): Promise<unknown> {
  let body: BodyInit;
  const headers: HeadersInit = {};
  if (group === "uploads" && method === "upload") {
    const form = new FormData();
    form.set("file", args[0] as File);
    form.set("purpose", String(args[1]));
    body = form;
  } else {
    headers["content-type"] = "application/json";
    body = JSON.stringify({ group, method, args });
  }

  let res: Response;
  try {
    res = await fetch("/api/rpc", { method: "POST", headers, body, credentials: "same-origin", cache: "no-store" });
  } catch {
    throw new ApiError("NETWORK", "Can't reach the server. Check your connection and try again.");
  }

  let payload: { data?: unknown; error?: { code: ApiErrorCode; message: string; fieldErrors?: Record<string, string>; details?: Record<string, unknown> } };
  try {
    payload = await res.json();
  } catch {
    throw new ApiError("UNKNOWN", `Unexpected server response (${res.status}).`);
  }
  if (payload.error) {
    const e = payload.error;
    throw new ApiError(e.code ?? "UNKNOWN", e.message ?? "Something went wrong", { fieldErrors: e.fieldErrors, details: e.details });
  }
  return payload.data;
}

function group<K extends Exclude<keyof ApiClient, "mode">>(name: K): ApiClient[K] {
  return new Proxy({} as Record<string, unknown>, {
    get(_, method) {
      if (typeof method !== "string" || method === "then") return undefined;
      return (...args: unknown[]) => call(name, method, args);
    },
  }) as unknown as ApiClient[K];
}

export const rpcApi: ApiClient = {
  mode: "supabase",
  auth: group("auth"),
  registration: group("registration"),
  uploads: group("uploads"),
  wallet: group("wallet"),
  operations: group("operations"),
  transactions: group("transactions"),
  notifications: group("notifications"),
  profile: group("profile"),
  security: group("security"),
  personal: group("personal"),
  agent: group("agent"),
  merchant: group("merchant"),
  lookup: group("lookup"),
  admin: group("admin"),
  dev: group("dev"),
};
