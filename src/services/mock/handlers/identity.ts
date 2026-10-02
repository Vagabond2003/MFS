import {
  agentRegistrationSchema,
  merchantRegistrationSchema,
  passwordSchema,
  personalRegistrationSchema,
  phoneSchema,
  sniffFileSignature,
  validateUploadFile,
  zodFieldErrors,
} from "@/lib/validation";
import { maskPhone, normalizePhone } from "@/lib/utils";
import type { AccountStatus, DocumentType, Role, SessionInfo } from "@/types/domain";
import type { AuthApi, RegistrationApi, UploadApi, UploadPurpose } from "../../contracts";
import { ApiError } from "../../errors";
import { providers } from "../../providers";
import {
  audit,
  checkOtp,
  clearSessionCookie,
  consumeRateLimit,
  createSession,
  issueOtp,
  notify,
  resolveCaller,
  setSessionCookie,
} from "../context";
import { hashSecret, randomDigits, randomId, verifySecret } from "../crypto";
import { settleDue } from "../ledger";
import { SECURITY } from "../policy";
import type { DbState, SessionRecord, UserRecord } from "../schema";
import { write } from "../store";
import { toCurrentUser } from "../views";

type Outcome<T> = { error: ApiError } | { ok: T };

function unwrap<T>(o: Outcome<T>): T {
  if ("error" in o) throw o.error;
  return o.ok;
}

function sessionInfo(db: DbState, session: SessionRecord, user: UserRecord): SessionInfo {
  return { sessionId: session.id, expiresAt: session.expiresAt, user: toCurrentUser(db, user) };
}

function findByIdentifier(db: DbState, identifier: string) {
  const id = identifier.trim().toLowerCase();
  if (id.includes("@")) return db.users.find((u) => u.email?.toLowerCase() === id) ?? null;
  const phone = normalizePhone(id);
  return db.users.find((u) => u.phone === phone) ?? null;
}

const INVALID_LOGIN = () =>
  new ApiError("INVALID_CREDENTIALS", "The mobile number/email or password is incorrect.");

/* ───────────────────────── Auth ───────────────────────── */

export const auth: AuthApi = {
  async login({ identifier, password, remember }) {
    const outcome = await write<Outcome<{ result: Awaited<ReturnType<AuthApi["login"]>>; cookie?: { s: SessionRecord; role: Role } }>>(async (db) => {
      const key = identifier.trim().toLowerCase();
      consumeRateLimit(db, `login:${key}`, 10, 15 * 60_000);
      const user = findByIdentifier(db, identifier);
      if (!user) {
        audit(db, { actor: null, action: "LOGIN_FAILED", metadata: { reason: "Unknown account" } });
        return { error: INVALID_LOGIN() };
      }
      if (user.lockedUntil && Date.parse(user.lockedUntil) > Date.now()) {
        return { error: new ApiError("RATE_LIMITED", "Too many failed attempts. Your account is locked for 15 minutes.") };
      }
      if (!(await verifySecret(password, user.passwordHash))) {
        user.failedLoginCount += 1;
        audit(db, { actor: null, action: "LOGIN_FAILED", target: user.id, metadata: { reason: "Wrong password", identifier: maskPhone(user.phone) } });
        if (user.failedLoginCount >= SECURITY.loginMaxAttempts) {
          user.lockedUntil = new Date(Date.now() + SECURITY.loginLockMinutes * 60_000).toISOString();
          user.failedLoginCount = 0;
          notify(db, user.id, "SECURITY_ALERT", "Account temporarily locked", "We locked sign-in for 15 minutes after several wrong passwords. If this wasn't you, reset your password.", "/profile?tab=security");
          return { error: new ApiError("RATE_LIMITED", "Too many failed attempts. Your account is locked for 15 minutes.") };
        }
        return { error: INVALID_LOGIN() };
      }
      if (user.status === "SUSPENDED") {
        audit(db, { actor: user, action: "LOGIN_BLOCKED", target: user.id, metadata: { reason: "Suspended" } });
        return { error: new ApiError("ACCOUNT_SUSPENDED", "This account is suspended. Please contact support.") };
      }
      user.failedLoginCount = 0;
      user.lockedUntil = null;

      if (user.twoFactorEnabled) {
        const challenge = await issueOtp(db, { purpose: "LOGIN", destination: user.phone, userId: user.id, context: `login:${user.id}` });
        return { ok: { result: { status: "OTP_REQUIRED", challenge } } };
      }
      const s = createSession(db, user, remember);
      user.lastLoginAt = s.createdAt;
      audit(db, { actor: user, action: "LOGIN_SUCCESS", target: user.id, metadata: { method: "PASSWORD" } });
      return { ok: { result: { status: "AUTHENTICATED", session: sessionInfo(db, s, user) }, cookie: { s, role: user.role } } };
    });
    const { result, cookie } = unwrap(outcome);
    if (cookie) setSessionCookie(cookie.s, cookie.role);
    return result;
  },

  async verifyLoginOtp(challengeId, code, remember) {
    const outcome = await write<Outcome<{ info: SessionInfo; s: SessionRecord; role: Role }>>(async (db) => {
      const otp = db.otpCodes.find((o) => o.id === challengeId && o.purpose === "LOGIN");
      const user = otp?.userId ? db.users.find((u) => u.id === otp.userId) : null;
      if (!otp || !user) return { error: new ApiError("INVALID_OTP", "This sign-in request has expired. Please sign in again.") };
      const err = await checkOtp(db, { challengeId, code, purpose: "LOGIN", context: `login:${user.id}` });
      if (err) return { error: err };
      if (user.status === "SUSPENDED") return { error: new ApiError("ACCOUNT_SUSPENDED", "This account is suspended.") };
      const s = createSession(db, user, remember);
      user.lastLoginAt = s.createdAt;
      audit(db, { actor: user, action: "LOGIN_SUCCESS", target: user.id, metadata: { method: "PASSWORD_OTP" } });
      return { ok: { info: sessionInfo(db, s, user), s, role: user.role } };
    });
    const { info, s, role } = unwrap(outcome);
    setSessionCookie(s, role);
    return info;
  },

  async resendLoginOtp(challengeId) {
    return write(async (db) => {
      const otp = db.otpCodes.find((o) => o.id === challengeId && o.purpose === "LOGIN");
      if (!otp?.userId) throw new ApiError("INVALID_OTP", "This sign-in request has expired. Please sign in again.");
      if (Date.parse(otp.resendAvailableAt) > Date.now()) throw new ApiError("RATE_LIMITED", "Please wait before requesting another code.");
      return issueOtp(db, { purpose: "LOGIN", destination: otp.destination, userId: otp.userId, context: otp.context });
    });
  },

  async me() {
    const info = await write((db) => {
      const caller = resolveCaller(db);
      if (!caller) return null;
      if (Date.now() - Date.parse(caller.session.lastActiveAt) > 60_000) {
        caller.session.lastActiveAt = new Date().toISOString();
      }
      settleDue(db);
      return sessionInfo(db, caller.session, caller.user);
    });
    if (!info) clearSessionCookie();
    return info;
  },

  async logout() {
    await write((db) => {
      const caller = resolveCaller(db);
      if (!caller) return;
      caller.session.revokedAt = new Date().toISOString();
      audit(db, { actor: caller.user, action: "LOGOUT", target: caller.user.id });
    });
    clearSessionCookie();
  },

  async requestPasswordReset(identifier) {
    return write(async (db) => {
      consumeRateLimit(db, `reset:${identifier.trim().toLowerCase()}`, 5, 15 * 60_000);
      const user = findByIdentifier(db, identifier);
      if (!user) {
        // Same response shape for unknown accounts — avoids account enumeration.
        const decoy = normalizePhone(identifier);
        return {
          challengeId: randomId("otp"),
          destinationMasked: identifier.includes("@") ? identifier : maskPhone(decoy),
          expiresAt: new Date(Date.now() + SECURITY.otpTtlSeconds * 1000).toISOString(),
          resendAvailableAt: new Date(Date.now() + SECURITY.otpResendSeconds * 1000).toISOString(),
        };
      }
      audit(db, { actor: null, action: "PASSWORD_RESET_REQUESTED", target: user.id });
      return issueOtp(db, { purpose: "PASSWORD_RESET", destination: user.phone, userId: user.id, context: `reset:${user.id}` });
    });
  },

  async resetPassword({ challengeId, code, newPassword }) {
    const parsed = passwordSchema.safeParse(newPassword);
    if (!parsed.success) throw new ApiError("VALIDATION", parsed.error.issues[0].message);
    const outcome = await write<Outcome<true>>(async (db) => {
      const otp = db.otpCodes.find((o) => o.id === challengeId && o.purpose === "PASSWORD_RESET");
      const user = otp?.userId ? db.users.find((u) => u.id === otp.userId) : null;
      if (!otp || !user) return { error: new ApiError("INVALID_OTP", "Incorrect or expired code.") };
      const err = await checkOtp(db, { challengeId, code, purpose: "PASSWORD_RESET", context: `reset:${user.id}` });
      if (err) return { error: err };
      user.passwordHash = await hashSecret(newPassword);
      user.failedLoginCount = 0;
      user.lockedUntil = null;
      user.updatedAt = new Date().toISOString();
      for (const s of db.sessions) if (s.userId === user.id && !s.revokedAt) s.revokedAt = user.updatedAt;
      notify(db, user.id, "SECURITY_ALERT", "Password was reset", "Your password was reset and all devices were signed out.", "/profile?tab=security");
      audit(db, { actor: user, action: "PASSWORD_RESET", target: user.id });
      return { ok: true };
    });
    unwrap(outcome);
  },
};

/* ───────────────────────── Uploads ───────────────────────── */

const PURPOSE_TYPE: Record<UploadPurpose, DocumentType> = {
  NID: "NID_FRONT",
  PHOTO: "PHOTO",
  SELFIE: "SELFIE",
  BUSINESS_DOCUMENT: "OTHER",
};

export const uploads: UploadApi = {
  async upload(file, purpose) {
    const problem = validateUploadFile(file);
    if (problem) throw new ApiError("VALIDATION", problem);
    const sniffed = await sniffFileSignature(file);
    if (!sniffed || sniffed !== file.type) {
      throw new ApiError("VALIDATION", "The file's contents don't match its type. Upload a real JPG, PNG or PDF.");
    }
    const id = randomId("doc");
    const stored = await providers.storage.put(file, `uploads/${id}`);
    return write((db) => {
      consumeRateLimit(db, "uploads", 30, 10 * 60_000);
      const caller = resolveCaller(db);
      db.documents.push({
        id,
        userId: caller?.user.id ?? null,
        type: PURPOSE_TYPE[purpose],
        fileName: file.name.slice(0, 120),
        mimeType: sniffed,
        sizeBytes: file.size,
        sha256: stored.sha256,
        storageKey: stored.key,
        status: "PENDING",
        uploadedAt: new Date().toISOString(),
        reviewedAt: null,
        reviewNote: null,
        reviewedBy: null,
      });
      return { uploadId: id, fileName: file.name, mimeType: sniffed, sizeBytes: file.size };
    });
  },
};

/* ───────────────────────── Registration ───────────────────────── */

/** In-memory record of selfie checks started via the dev KYC provider. */
const selfieChecks = new Map<string, "PENDING" | "VERIFIED" | "FAILED">();

function linkDocument(db: DbState, uploadId: string | undefined | null, userId: string, type: DocumentType) {
  if (!uploadId) return;
  const d = db.documents.find((x) => x.id === uploadId);
  if (!d) throw new ApiError("VALIDATION", "An uploaded document could not be found. Please upload it again.");
  if (d.userId && d.userId !== userId) throw new ApiError("FORBIDDEN", "Document belongs to another account.");
  d.userId = userId;
  d.type = type;
}

function assertUnique(db: DbState, phone: string, email: string | null | undefined) {
  if (db.users.some((u) => u.phone === phone)) {
    throw new ApiError("CONFLICT", "This mobile number is already registered.", { fieldErrors: { phone: "Already registered" } });
  }
  if (email && db.users.some((u) => u.email?.toLowerCase() === email.toLowerCase())) {
    throw new ApiError("CONFLICT", "This email is already registered.", { fieldErrors: { email: "Already registered" } });
  }
}

async function newUser(input: { role: Role; name: string; phone: string; email: string | null; password: string; pin: string; status: AccountStatus }): Promise<UserRecord> {
  const now = new Date().toISOString();
  return {
    id: randomId("usr"),
    role: input.role,
    name: input.name,
    phone: input.phone,
    email: input.email,
    passwordHash: await hashSecret(input.password),
    pinHash: await hashSecret(input.pin),
    status: input.status,
    twoFactorEnabled: false,
    isDemo: false,
    failedLoginCount: 0,
    lockedUntil: null,
    pinFailedCount: 0,
    pinLockedUntil: null,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
  };
}

function addWallet(db: DbState, user: UserRecord) {
  db.wallets.push({
    id: randomId("wal"),
    userId: user.id,
    currency: "BDT",
    available: 0,
    savings: 0,
    pending: 0,
    cashInHand: user.role === "AGENT" ? 0 : null,
    version: 0,
    updatedAt: user.createdAt,
  });
}

function validationError(err: import("zod").ZodError) {
  const fieldErrors = zodFieldErrors(err);
  return new ApiError("VALIDATION", Object.values(fieldErrors)[0] ?? "Please check the form", { fieldErrors });
}

export const registration: RegistrationApi = {
  async sendPhoneOtp(phoneInput) {
    const parsed = phoneSchema.safeParse(phoneInput);
    if (!parsed.success) throw new ApiError("VALIDATION", parsed.error.issues[0].message);
    const phone = parsed.data;
    return write(async (db) => {
      if (db.users.some((u) => u.phone === phone)) {
        throw new ApiError("CONFLICT", "This mobile number is already registered. Try signing in instead.");
      }
      return issueOtp(db, { purpose: "REGISTRATION", destination: phone, userId: null, context: `register:${phone}` });
    });
  },

  async startSelfieCheck() {
    const check = await providers.kyc.startLivenessCheck();
    selfieChecks.set(check.checkId, check.status);
    return check;
  },

  async registerPersonal(raw) {
    const parsed = personalRegistrationSchema.safeParse(raw);
    if (!parsed.success) throw validationError(parsed.error);
    const input = parsed.data;
    const selfie = input.selfieCheckId ? selfieChecks.get(input.selfieCheckId) : undefined;
    const nidOk = input.nidNumber ? (await providers.kyc.matchNid(input.nidNumber, input.dateOfBirth)).match : false;
    const eKycPassed = !!input.nidNumber && !!input.nidDocument && selfie === "VERIFIED" && nidOk;

    const outcome = await write<Outcome<{ userId: string }>>(async (db) => {
      const err = await checkOtp(db, { challengeId: input.otpChallengeId, code: input.otpCode, purpose: "REGISTRATION", context: `register:${input.phone}` });
      if (err) return { error: err };
      assertUnique(db, input.phone, input.email || null);
      const user = await newUser({ role: "PERSONAL", name: input.fullName, phone: input.phone, email: input.email || null, password: input.password, pin: input.pin, status: eKycPassed ? "VERIFIED" : "PENDING_VERIFICATION" });
      db.users.push(user);
      addWallet(db, user);
      db.personalProfiles.push({
        userId: user.id,
        dateOfBirth: input.dateOfBirth,
        address: input.address,
        nidNumber: input.nidNumber || null,
        selfieStatus: selfie ?? "NOT_SUBMITTED",
      });
      linkDocument(db, input.nidDocument?.uploadId, user.id, "NID_FRONT");
      if (eKycPassed) {
        for (const d of db.documents) if (d.userId === user.id) d.status = "APPROVED";
      }
      db.statusHistory.push({ id: randomId("sth"), userId: user.id, status: "PENDING_VERIFICATION", note: "Account created", actorId: null, at: user.createdAt });
      if (eKycPassed) db.statusHistory.push({ id: randomId("sth"), userId: user.id, status: "VERIFIED", note: "e-KYC passed (NID + selfie match)", actorId: null, at: user.createdAt });
      notify(db, user.id, "ACCOUNT_VERIFICATION", eKycPassed ? "Welcome — you're verified" : "Welcome to Kosh", eKycPassed ? "Your identity was verified instantly. Full limits are active." : "Complete identity verification to unlock full limits.", "/profile");
      audit(db, { actor: user, action: "USER_REGISTERED", target: user.id, metadata: { role: "PERSONAL", eKyc: eKycPassed } });
      return { ok: { userId: user.id } };
    });
    return unwrap(outcome);
  },

  async registerAgent(raw) {
    const parsed = agentRegistrationSchema.safeParse(raw);
    if (!parsed.success) throw validationError(parsed.error);
    const input = parsed.data;
    const outcome = await write<Outcome<{ userId: string; applicationId: string }>>(async (db) => {
      const err = await checkOtp(db, { challengeId: input.otpChallengeId, code: input.otpCode, purpose: "REGISTRATION", context: `register:${input.phone}` });
      if (err) return { error: err };
      assertUnique(db, input.phone, input.email);
      const user = await newUser({ role: "AGENT", name: input.fullName, phone: input.phone, email: input.email, password: input.password, pin: input.pin, status: "APPLICATION_SUBMITTED" });
      db.users.push(user);
      addWallet(db, user);
      let agentCode = "";
      do agentCode = `AG-${randomDigits(5)}`;
      while (db.agentProfiles.some((a) => a.agentCode === agentCode));
      db.agentProfiles.push({
        userId: user.id,
        agentCode,
        dateOfBirth: input.dateOfBirth,
        address: input.address,
        outletName: input.outletName,
        businessAddress: input.businessAddress,
        emergencyName: input.emergencyName,
        emergencyRelation: input.emergencyRelation,
        emergencyPhone: input.emergencyPhone,
        nidNumber: input.nidNumber,
        reviewNote: null,
      });
      linkDocument(db, input.nidFront.uploadId, user.id, "NID_FRONT");
      linkDocument(db, input.nidBack.uploadId, user.id, "NID_BACK");
      linkDocument(db, input.photo.uploadId, user.id, "PHOTO");
      db.statusHistory.push({ id: randomId("sth"), userId: user.id, status: "APPLICATION_SUBMITTED", note: "Agent application submitted", actorId: null, at: user.createdAt });
      notify(db, user.id, "ACCOUNT_VERIFICATION", "Application submitted", `Your agent application (${agentCode}) was received. We'll notify you when the review is complete.`, "/dashboard/agent/verification");
      audit(db, { actor: user, action: "USER_REGISTERED", target: user.id, metadata: { role: "AGENT" } });
      return { ok: { userId: user.id, applicationId: agentCode } };
    });
    return unwrap(outcome);
  },

  async registerMerchant(raw) {
    const parsed = merchantRegistrationSchema.safeParse(raw);
    if (!parsed.success) throw validationError(parsed.error);
    const input = parsed.data;
    const outcome = await write<Outcome<{ userId: string; merchantId: string }>>(async (db) => {
      const err = await checkOtp(db, { challengeId: input.otpChallengeId, code: input.otpCode, purpose: "REGISTRATION", context: `register:${input.phone}` });
      if (err) return { error: err };
      assertUnique(db, input.phone, input.email);
      const user = await newUser({ role: "MERCHANT", name: input.ownerName, phone: input.phone, email: input.email, password: input.password, pin: input.pin, status: "PENDING" });
      db.users.push(user);
      addWallet(db, user);
      let merchantId = "";
      do merchantId = `MR-${randomDigits(5)}`;
      while (db.merchantBusinesses.some((b) => b.merchantId === merchantId));
      db.merchantProfiles.push({ userId: user.id, ownerName: input.ownerName, ownerNidNumber: input.ownerNidNumber, reviewNote: null });
      db.merchantBusinesses.push({
        id: randomId("biz"),
        userId: user.id,
        merchantId,
        businessName: input.businessName,
        category: input.category,
        businessAddress: input.businessAddress,
        registrationNumber: input.registrationNumber,
        tradeLicenseNumber: input.tradeLicenseNumber,
        taxId: input.taxId || null,
        settlementAccount: "Not linked yet",
      });
      linkDocument(db, input.tradeLicenseDoc.uploadId, user.id, "TRADE_LICENSE");
      linkDocument(db, input.registrationDoc.uploadId, user.id, "BUSINESS_REGISTRATION");
      linkDocument(db, input.ownerNidDoc.uploadId, user.id, "OWNER_NID");
      linkDocument(db, input.taxDoc?.uploadId, user.id, "TAX_CERTIFICATE");
      db.statusHistory.push({ id: randomId("sth"), userId: user.id, status: "PENDING", note: "Merchant application submitted", actorId: null, at: user.createdAt });
      notify(db, user.id, "ACCOUNT_VERIFICATION", "Business documents received", `Merchant ID ${merchantId} is reserved for ${input.businessName}. Payments will be enabled after verification.`, "/dashboard/merchant/business");
      audit(db, { actor: user, action: "USER_REGISTERED", target: user.id, metadata: { role: "MERCHANT" } });
      return { ok: { userId: user.id, merchantId } };
    });
    return unwrap(outcome);
  },
};
