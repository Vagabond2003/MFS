import { formatMoney, maskEmail, maskPhone } from "@/lib/utils";
import { isDeliverableEmail } from "@/lib/validation";
import type { NotificationType, OtpChallenge, OtpPurpose, Role } from "@/types/domain";
import { ApiError } from "../errors";
import { providers } from "../providers";
import { randomDigits, randomId, sha256Hex } from "./crypto";
import { SECURITY } from "./policy";
import { requestEnv, type OutgoingEmail } from "./runtime";
import type { DbState, SessionRecord, UserRecord } from "./schema";

/* ───────────── Request metadata (what a server would read from headers) ───────────── */

export function requestDevice() {
  const ua = requestEnv().userAgent();
  if (!ua) return "Unknown device";
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

export function requestIp() {
  return requestEnv().ip();
}

export const MOCK_LOCATION = "Dhaka, BD (approx.)";

export function maskIp(ip: string) {
  const parts = ip.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.•••.•••` : "•••";
}

/* ───────────── Session cookie ───────────── */

export function setSessionCookie(session: SessionRecord, role: Role) {
  const exp = Math.floor(Date.parse(session.expiresAt) / 1000);
  requestEnv().setSession({ sid: session.id, role, exp }, session.remember);
}

export function clearSessionCookie() {
  requestEnv().clearSession();
}

/**
 * Resolves the caller from the session table. The role comes from the users
 * table — NOT from the cookie — so an edited cookie cannot elevate privileges.
 */
export function resolveCaller(db: DbState): { user: UserRecord; session: SessionRecord } | null {
  const claims = requestEnv().claims();
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
    ip: requestIp(),
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
    ip: requestIp(),
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
  if (EMAILED_NOTIFICATIONS.has(type)) {
    const user = db.users.find((u) => u.id === userId);
    if (isDeliverableEmail(user?.email)) queueEmail({ kind: "NOTICE", to: user!.email!, lang: user.language ?? "en", name: user.name, title, body, link });
  }
}

/** Notifications that are also emailed (to accounts with an email address). */
const EMAILED_NOTIFICATIONS = new Set<NotificationType>(["ACCOUNT_VERIFICATION", "SECURITY_ALERT", "MONEY_SENT", "MONEY_RECEIVED", "PAYMENT_FAILED", "AGENT_SETTLEMENT"]);

/** Queues an email for after the call succeeds; a no-op outside a server request (scripts, seeds). */
function queueEmail(email: OutgoingEmail) {
  try {
    requestEnv().queueEmail(email);
  } catch {
    // no request context
  }
}

function emailEnabled() {
  try {
    return requestEnv().emailEnabled();
  } catch {
    return false;
  }
}

/** Show codes on screen (development SMS provider) unless OTP_SHOW_CODES=false. */
const showCodesOnScreen = () => providers.sms.exposesCodes && process.env.OTP_SHOW_CODES !== "false";

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
  input: {
    purpose: OtpPurpose;
    destination: string;
    userId: string | null;
    context: string;
    /** Registration only: the email typed on the form (there's no account yet). */
    email?: string | null;
  },
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

  // The code also goes by email to the owner of the destination phone (for an
  // agent-assisted cash out that is the customer, not the agent) — or, at
  // registration, to the email typed on the form.
  const owner = db.users.find((u) => u.phone === input.destination) ?? null;
  const email = owner ? owner.email : (input.email ?? null);
  const emailed = isDeliverableEmail(email) && emailEnabled();
  if (emailed) queueEmail({ kind: "OTP", to: email, lang: owner?.language ?? requestEnv().lang(), name: owner?.name ?? null, code, purpose: input.purpose });

  const phoneMasked = input.destination.includes("@") ? input.destination : maskPhone(input.destination);
  return {
    challengeId: id,
    destinationMasked: emailed ? `${phoneMasked} · ${maskEmail(email)}` : phoneMasked,
    expiresAt: new Date(now + SECURITY.otpTtlSeconds * 1000).toISOString(),
    resendAvailableAt: new Date(now + SECURITY.otpResendSeconds * 1000).toISOString(),
    devCode: showCodesOnScreen() ? code : undefined,
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
