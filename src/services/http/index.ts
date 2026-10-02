import type { ApiClient } from "../contracts";
import { ApiError, type ApiErrorCode } from "../errors";

/**
 * REST client for a real backend. Implements the same ApiClient contract as
 * the mock. Enable with NEXT_PUBLIC_API_MODE=http and NEXT_PUBLIC_API_BASE_URL.
 *
 * Security expectations of the backend (see README → API contract):
 *  - session in an httpOnly, Secure, SameSite=Lax cookie (signed JWT {sid, role, exp})
 *  - CSRF: double-submit token — backend sets a readable `csrf_token` cookie,
 *    this client echoes it in `X-CSRF-Token` on every mutating request
 *  - `Idempotency-Key` honoured on POST /operations/execute
 */

const BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

function csrfToken() {
  if (typeof document === "undefined") return null;
  const hit = document.cookie.split("; ").find((c) => c.startsWith("csrf_token="));
  return hit ? decodeURIComponent(hit.slice("csrf_token=".length)) : null;
}

type Query = Record<string, string | number | boolean | undefined | null>;

function qs(query?: Query) {
  if (!query) return "";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  opts: { body?: unknown; query?: Query; headers?: Record<string, string>; form?: FormData } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...opts.headers };
  if (method !== "GET") {
    const csrf = csrfToken();
    if (csrf) headers["X-CSRF-Token"] = csrf;
  }
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}${qs(opts.query)}`, { method, headers, body, credentials: "include", cache: "no-store" });
  } catch {
    throw new ApiError("NETWORK", "Can't reach the server. Check your connection and try again.");
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const code = (data?.code as ApiErrorCode) ?? (res.status === 401 ? "UNAUTHENTICATED" : res.status === 403 ? "FORBIDDEN" : "UNKNOWN");
    throw new ApiError(code, data?.message ?? `Request failed (${res.status})`, { fieldErrors: data?.fieldErrors, details: data?.details });
  }
  return data as T;
}

const get = <T>(path: string, query?: Query) => request<T>("GET", path, { query });
const postJson = <T>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>("POST", path, { body, headers });

const notSupported = async (): Promise<never> => {
  throw new ApiError("NOT_SUPPORTED", "This development tool is only available in mock mode.");
};

export const httpApi: ApiClient = {
  mode: "http",
  auth: {
    login: (input) => postJson("/auth/login", input),
    verifyLoginOtp: (challengeId, code, remember) => postJson("/auth/login/otp", { challengeId, code, remember }),
    resendLoginOtp: (challengeId) => postJson("/auth/login/otp/resend", { challengeId }),
    me: async () => {
      try {
        return await get("/auth/me");
      } catch (e) {
        if (e instanceof ApiError && e.code === "UNAUTHENTICATED") return null;
        throw e;
      }
    },
    logout: () => postJson("/auth/logout"),
    requestPasswordReset: (identifier) => postJson("/auth/password-reset", { identifier }),
    resetPassword: (input) => postJson("/auth/password-reset/confirm", input),
  },
  registration: {
    sendPhoneOtp: (phone) => postJson("/register/otp", { phone }),
    registerPersonal: (input) => postJson("/register/personal", input),
    registerAgent: (input) => postJson("/register/agent", input),
    registerMerchant: (input) => postJson("/register/merchant", input),
    startSelfieCheck: () => postJson("/kyc/selfie-checks"),
  },
  uploads: {
    upload: (file, purpose) => {
      const form = new FormData();
      form.set("file", file);
      form.set("purpose", purpose);
      return request("POST", "/uploads", { form });
    },
  },
  wallet: {
    get: () => get("/wallet"),
    fundingSources: () => get("/wallet/funding-sources"),
  },
  operations: {
    quote: (req) => postJson("/operations/quote", req),
    requestOtp: (req) => postJson("/operations/otp", req),
    execute: (req, auth) =>
      postJson("/operations/execute", { request: req, pin: auth.pin, otp: auth.otp }, { "Idempotency-Key": auth.idempotencyKey }),
  },
  transactions: {
    list: (q) => get("/transactions", { ...q }),
    get: (trxId) => get(`/transactions/${encodeURIComponent(trxId)}`),
    raiseDispute: (trxId, reason) => postJson(`/transactions/${encodeURIComponent(trxId)}/disputes`, { reason }),
  },
  notifications: {
    list: (q) => get("/notifications", { ...q }),
    unreadCount: async () => (await get<{ count: number }>("/notifications/unread-count")).count,
    markRead: (id) => postJson(`/notifications/${encodeURIComponent(id)}/read`),
    markAllRead: () => postJson("/notifications/read-all"),
  },
  profile: {
    get: () => get("/profile"),
    update: (input) => request("PATCH", "/profile", { body: input }),
  },
  security: {
    changePassword: (input) => postJson("/security/password", input),
    requestPinChangeOtp: () => postJson("/security/pin/otp"),
    changePin: (input) => postJson("/security/pin", input),
    requestTwoFactorOtp: () => postJson("/security/2fa/otp"),
    setTwoFactor: (input) => postJson("/security/2fa", input),
    sessions: () => get("/security/sessions"),
    revokeSession: (id) => request("DELETE", `/security/sessions/${encodeURIComponent(id)}`),
    logoutAll: () => postJson("/security/logout-all"),
    loginHistory: () => get("/security/login-history"),
  },
  personal: {
    dashboard: () => get("/personal/dashboard"),
    recentRecipients: () => get("/personal/recipients"),
  },
  agent: {
    dashboard: () => get("/agent/dashboard"),
    commissions: () => get("/agent/commissions"),
    settlements: () => get("/agent/settlements"),
  },
  merchant: {
    dashboard: () => get("/merchant/dashboard"),
    qr: () => get("/merchant/qr"),
    createPaymentRequest: (input) => postJson("/merchant/payment-requests", input),
    getPaymentRequest: (id) => get(`/merchant/payment-requests/${encodeURIComponent(id)}`),
    listPaymentRequests: () => get("/merchant/payment-requests"),
    cancelPaymentRequest: (id) => postJson(`/merchant/payment-requests/${encodeURIComponent(id)}/cancel`),
    simulateQrPayment: notSupported,
    settlements: () => get("/merchant/settlements"),
  },
  lookup: {
    billers: () => get("/billers"),
    fetchBill: (billerId, accountNumber) => get(`/billers/${encodeURIComponent(billerId)}/bills`, { account: accountNumber }),
    resolveMerchant: (input) => postJson("/merchants/resolve", { input }),
  },
  admin: {
    stats: () => get("/admin/stats"),
    users: (q) => get("/admin/users", { ...q }),
    user: (id) => get(`/admin/users/${encodeURIComponent(id)}`),
    setUserStatus: (id, action, reason) => postJson(`/admin/users/${encodeURIComponent(id)}/status`, { action, reason }),
    verificationQueue: (q) => get("/admin/verifications", { ...q }),
    decideVerification: (userId, decision, note) => postJson(`/admin/verifications/${encodeURIComponent(userId)}/decision`, { decision, note }),
    reviewDocument: (id, status, note) => postJson(`/admin/documents/${encodeURIComponent(id)}/review`, { status, note }),
    transactions: (q) => get("/admin/transactions", { ...q }),
    disputes: (q) => get("/admin/disputes", { ...q }),
    updateDispute: (id, status, resolution) => request("PATCH", `/admin/disputes/${encodeURIComponent(id)}`, { body: { status, resolution } }),
    auditLogs: (q) => get("/admin/audit-logs", { ...q }),
  },
  dev: {
    resetDemoData: notSupported,
  },
};
