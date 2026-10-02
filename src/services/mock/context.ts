import { SESSION_COOKIE, decodeMockToken, encodeMockToken } from "@/lib/auth/session-token";
import { formatMoney, maskPhone } from "@/lib/utils";
import type { NotificationType, OtpChallenge, OtpPurpose, Role } from "@/types/domain";
import { ApiError } from "../errors";
import { providers } from "../providers";
import { randomDigits, randomId, sha256Hex } from "./crypto";
import { SECURITY } from "./policy";
import type { DbState, SessionRecord, UserRecord } from "./schema";

/* ───────────── Request metadata (what a server would read from headers) ───────────── */

export function requestDevice() {
  if (typeof navigator === "undefined") return "Unknown device";
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "Unknown OS";
  return `${browser} on ${os}`;
}

/** The mock cannot see a real client IP; a documentation-range address is used. */
export const MOCK_IP = "203.0.113.24";
export const MOCK_LOCATION = "Dhaka, BD (approx.)";

export function maskIp(ip: string) {
  const parts = ip.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.•••.•••` : "•••";
}

/* ───────────── Session cookie ───────────── */

function readCookie(name: string) {
  if (typeof document === "undefined") return null;
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
}

export function setSessionCookie(session: SessionRecord, role: Role) {
  const exp = Math.floor(Date.parse(session.expiresAt) / 1000);
  const token = encodeMockToken({ sid: session.id, role, exp });
  const maxAge = session.remember ? `; max-age=${SECURITY.rememberDays * 86400}` : "";
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}; path=/; samesite=lax${maxAge}${secure}`;
}

export function clearSessionCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

/**
 * Resolves the caller from the session table. The role comes from the users
 * table — NOT from the cookie — so an edited cookie cannot elevate privileges.
 */
export function resolveCaller(db: DbState): { user: UserRecord; session: SessionRecord } | null {
  const token = readCookie(SESSION_COOKIE);
  const claims = token ? decodeMockToken(token) : null;
  if (!claims) return null;
  const session = db.sessions.find((s) => s.id === claims.sid);
  if (!session || session.revokedAt || Date.parse(session.expiresAt) <= Date.now()) return null;
  const user = db.users.find((u) => u.id === session.userId);
  if (!user || user.status === "SUSPENDED") return null;
  return { user, session };
}

export function requireCaller(db: DbState, roles?: readonly Role[]) {
  const caller = resolveCaller(db);
  if (!caller) throw new ApiError("UNAUTHENTICATED", "Your session has ended. Please sign in again.");
  if (roles && !roles.includes(caller.user.role)) {
    throw new ApiError("FORBIDDEN", "Your account type is not allowed to perform this action.");
  }
  return caller;
}

export function createSession(db: DbState, user: UserRecord, remember: boolean): SessionRecord {
  const now = new Date();
  const ttl = remember ? SECURITY.rememberDays * 86_400_000 : SECURITY.sessionHours * 3_600_000;
  const session: SessionRecord = {
    id: randomId("ses"),
    userId: user.id,
    device: requestDevice(),
    location: MOCK_LOCATION,
    ip: MOCK_IP,
    remember,
    createdAt: now.toISOString(),
    lastActiveAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttl).toISOString(),
    revokedAt: null,
  };
  db.sessions.push(session);
  return session;
}

/* ───────────── Audit log & notifications ───────────── */

export function audit(
  db: DbState,
  entry: {
    actor: UserRecord | null;
    action: string;
    target?: string | null;
    metadata?: Record<string, string | number | boolean | null>;
    at?: string;
  },
) {
  db.auditLogs.push({
    id: randomId("aud"),
    actorId: entry.actor?.id ?? null,
    actorRole: entry.actor?.role ?? "ANONYMOUS",
    actorName: entry.actor?.name ?? "Anonymous",
    action: entry.action,
    target: entry.target ?? null,
    ip: MOCK_IP,
    createdAt: entry.at ?? new Date().toISOString(),
    metadata: { device: requestDevice(), ...entry.metadata },
  });
}

export function notify(
  db: DbState,
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  link: string | null = null,
  at?: string,
) {
  db.notifications.push({
    id: randomId("ntf"),
    userId,
    type,
    title,
    body,
    read: false,
    link,
    createdAt: at ?? new Date().toISOString(),
  });
}

export function money(minor: number) {
  return formatMoney(minor);
}

/* ───────────── Rate limiting (fixed window) ───────────── */

export function consumeRateLimit(db: DbState, key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = db.rateLimits[key];
  if (!bucket || bucket.resetAt <= now) {
    db.rateLimits[key] = { count: 1, resetAt: now + windowMs };
    return;
  }
  if (bucket.count >= limit) {
    const wait = Math.ceil((bucket.resetAt - now) / 60_000);
    throw new ApiError("RATE_LIMITED", `Too many attempts. Try again in ${wait} minute${wait === 1 ? "" : "s"}.`);
  }
  bucket.count += 1;
}

/* ───────────── OTP ───────────── */

export async function issueOtp(
  db: DbState,
  input: { purpose: OtpPurpose; destination: string; userId: string | null; context: string },
): Promise<OtpChallenge> {
  consumeRateLimit(
    db,
    `otp:${input.destination}`,
    SECURITY.otpSendPerWindow,
    SECURITY.otpSendWindowMinutes * 60_000,
  );
  const id = randomId("otp");
  const code = randomDigits(6);
  const now = Date.now();
  // Invalidate earlier unconsumed codes for the same purpose+destination.
  for (const o of db.otpCodes) {
    if (o.destination === input.destination && o.purpose === input.purpose && !o.consumedAt) {
      o.consumedAt = new Date(now).toISOString();
    }
  }
  db.otpCodes.push({
    id,
    purpose: input.purpose,
    userId: input.userId,
    destination: input.destination,
    codeHash: await sha256Hex(`${id}:${code}`),
    context: input.context,
    attempts: 0,
    maxAttempts: SECURITY.otpMaxAttempts,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SECURITY.otpTtlSeconds * 1000).toISOString(),
    resendAvailableAt: new Date(now + SECURITY.otpResendSeconds * 1000).toISOString(),
    verifiedAt: null,
    consumedAt: null,
  });
  await providers.sms.send(input.destination, `Your Kosh verification code is ${code}. Do not share it with anyone.`);
  return {
    challengeId: id,
    destinationMasked: input.destination.includes("@") ? input.destination : maskPhone(input.destination),
    expiresAt: new Date(now + SECURITY.otpTtlSeconds * 1000).toISOString(),
    resendAvailableAt: new Date(now + SECURITY.otpResendSeconds * 1000).toISOString(),
    devCode: providers.sms.exposesCodes ? code : undefined,
  };
}

/**
 * Verifies and consumes an OTP. Returns an error instead of throwing so the
 * caller can commit the attempt counter before surfacing the failure.
 */
export async function checkOtp(
  db: DbState,
  input: { challengeId: string; code: string; purpose: OtpPurpose; context?: string },
): Promise<ApiError | null> {
  const otp = db.otpCodes.find((o) => o.id === input.challengeId);
  if (!otp || otp.purpose !== input.purpose || (input.context !== undefined && otp.context !== input.context)) {
    return new ApiError("INVALID_OTP", "This verification code is not valid for this request.");
  }
  if (otp.consumedAt) return new ApiError("OTP_EXPIRED", "This code has already been used. Request a new one.");
  if (Date.parse(otp.expiresAt) <= Date.now()) {
    return new ApiError("OTP_EXPIRED", "This code has expired. Request a new one.");
  }
  if (otp.attempts >= otp.maxAttempts) {
    return new ApiError("RATE_LIMITED", "Too many incorrect codes. Request a new one.");
  }
  const ok = (await sha256Hex(`${otp.id}:${input.code}`)) === otp.codeHash;
  if (!ok) {
    otp.attempts += 1;
    const left = otp.maxAttempts - otp.attempts;
    return new ApiError("INVALID_OTP", left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.` : "Too many incorrect codes. Request a new one.");
  }
  otp.verifiedAt = new Date().toISOString();
  otp.consumedAt = otp.verifiedAt;
  return null;
}
