import { emailSchema, passwordSchema, pinSchema, addressSchema, languageSchema } from "@/lib/validation";
import { maskPhone } from "@/lib/utils";
import { cleanUpAvatars, ownAvatar } from "@/server/avatars";
import type {
  LoginEvent,
  Paginated,
  SessionView,
  SettlementView,
  TransactionQuery,
  TransactionView,
} from "@/types/domain";
import type {
  AgentApi,
  LookupApi,
  MerchantApi,
  NotificationsApi,
  PersonalApi,
  ProfileApi,
  SecurityApi,
  TransactionsApi,
  WalletApi,
} from "../../contracts";
import { ApiError } from "../../errors";
import { BILLERS, providers, qrCodec } from "../../providers";
import { agentDashboard, commissionSummary, merchantDashboard, personalDashboard } from "../analytics";
import {
  audit,
  checkOtp,
  clearSessionCookie,
  issueOtp,
  maskIp,
  notify,
  requireCaller,
} from "../context";
import { hashSecret, randomId, shortCode, verifySecret } from "../crypto";
import { isParty, post, settleDue, walletOf } from "../ledger";
import { SECURITY, computeFees } from "../policy";
import type { DbState, PaymentRequestRecord, TransactionRecord, UserRecord } from "../schema";
import { read, write } from "../store";
import { notifyParties } from "../txn-notify";
import { partyAvatarUrl, toNotificationView, toProfileView, toTransactionView, toWalletView } from "../views";

const CUSTOMERS = ["Walk-in customer", "Rina Sarkar (demo)", "Kabir Uddin (demo)", "Moushumi Akter (demo)"];

export function paginate<T>(items: T[], page = 1, pageSize = 10): Paginated<T> {
  const size = Math.min(Math.max(pageSize, 1), 100);
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(Math.max(page, 1), totalPages);
  return { items: items.slice((p - 1) * size, p * size), page: p, pageSize: size, total: items.length, totalPages };
}

/** Filters transaction views. Shared with the admin console. */
export function filterTransactions(views: TransactionView[], q: TransactionQuery) {
  const search = q.search?.trim().toLowerCase();
  const from = q.from ? new Date(`${q.from}T00:00:00`).getTime() : null;
  const to = q.to ? new Date(`${q.to}T23:59:59.999`).getTime() : null;
  return views.filter((v) => {
    if (q.type && q.type !== "ALL" && v.type !== q.type) return false;
    if (q.status && q.status !== "ALL" && v.status !== q.status) return false;
    const t = Date.parse(v.createdAt);
    if (from !== null && t < from) return false;
    if (to !== null && t > to) return false;
    if (search) {
      const hay = `${v.trxId} ${v.counterparty.name} ${v.counterparty.account} ${v.sender.name} ${v.receiver.name} ${v.description}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

const newestFirst = (a: TransactionRecord, b: TransactionRecord) => b.createdAt.localeCompare(a.createdAt);

/* ───────────── Wallet ───────────── */

export const wallet: WalletApi = {
  async get() {
    return write((db) => {
      settleDue(db);
      const { user } = requireCaller(db, ["PERSONAL", "AGENT", "MERCHANT"]);
      return toWalletView(walletOf(db, user.id));
    });
  },
  async fundingSources() {
    const user = await read((db) => requireCaller(db, ["PERSONAL"]).user);
    return providers.gateway.fundingSources(user.id);
  },
};

/* ───────────── Transactions ───────────── */

export const transactions: TransactionsApi = {
  async list(q) {
    return read((db) => {
      const { user } = requireCaller(db, ["PERSONAL", "AGENT", "MERCHANT"]);
      const views = db.transactions
        .filter((t) => isParty(t, user.id))
        .sort(newestFirst)
        .map((t) => toTransactionView(db, t, user.id));
      return paginate(filterTransactions(views, q), q.page, q.pageSize);
    });
  },

  async get(trxId) {
    return read((db) => {
      const { user } = requireCaller(db, ["PERSONAL", "AGENT", "MERCHANT"]);
      const t = db.transactions.find((x) => x.trxId === trxId.trim().toUpperCase());
      // Not-a-party looks identical to not-found: existence isn't leaked.
      if (!t || !isParty(t, user.id)) throw new ApiError("NOT_FOUND", "Transaction not found.");
      return toTransactionView(db, t, user.id);
    });
  },

  async raiseDispute(trxId, reason) {
    return write((db) => {
      const { user } = requireCaller(db, ["PERSONAL"]);
      const t = db.transactions.find((x) => x.trxId === trxId);
      if (!t || !isParty(t, user.id)) throw new ApiError("NOT_FOUND", "Transaction not found.");
      if (!toTransactionView(db, t, user.id).canDispute) throw new ApiError("CONFLICT", "This transaction can't be disputed.");
      const text = reason.trim();
      if (text.length < 10) throw new ApiError("VALIDATION", "Please describe the problem (at least 10 characters).");
      const now = new Date().toISOString();
      const d = { id: randomId("dsp"), trxId, userId: user.id, reason: text.slice(0, 500), status: "OPEN" as const, resolution: null, amount: t.amount, createdAt: now, updatedAt: now };
      db.disputes.push(d);
      notify(db, user.id, "SYSTEM_ANNOUNCEMENT", "Dispute received", `We're looking into ${trxId}. You'll be notified when there's an update.`, `/transactions?trx=${trxId}`);
      audit(db, { actor: user, action: "DISPUTE_RAISED", target: trxId });
      return { ...d, raisedBy: { id: user.id, name: user.name, role: user.role } };
    });
  },
};

/* ───────────── Notifications ───────────── */

export const notifications: NotificationsApi = {
  async list({ unreadOnly, page, pageSize }) {
    return read((db) => {
      const { user } = requireCaller(db);
      const items = db.notifications
        .filter((n) => n.userId === user.id && (!unreadOnly || !n.read))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(toNotificationView);
      return paginate(items, page, pageSize ?? 20);
    });
  },
  async unreadCount() {
    return read((db) => {
      const { user } = requireCaller(db);
      return db.notifications.filter((n) => n.userId === user.id && !n.read).length;
    });
  },
  async markRead(id) {
    await write((db) => {
      const { user } = requireCaller(db);
      const n = db.notifications.find((x) => x.id === id && x.userId === user.id);
      if (n) n.read = true;
    });
  },
  async markAllRead() {
    await write((db) => {
      const { user } = requireCaller(db);
      for (const n of db.notifications) if (n.userId === user.id) n.read = true;
    });
  },
};

/* ───────────── Profile & security ───────────── */

export const profile: ProfileApi = {
  async get() {
    return read((db) => toProfileView(db, requireCaller(db).user));
  },
  async update(input) {
    return write((db) => {
      const { user } = requireCaller(db);
      if (input.email !== undefined) {
        if (input.email === null || input.email === "") {
          if (user.role !== "PERSONAL") throw new ApiError("VALIDATION", "Email is required for this account type.");
          user.email = null;
        } else {
          const parsed = emailSchema.safeParse(input.email);
          if (!parsed.success) throw new ApiError("VALIDATION", parsed.error.issues[0].message);
          if (db.users.some((u) => u.id !== user.id && u.email?.toLowerCase() === parsed.data.toLowerCase())) {
            throw new ApiError("CONFLICT", "This email is already in use.");
          }
          user.email = parsed.data;
        }
      }
      if (input.address !== undefined) {
        const parsed = addressSchema.safeParse(input.address);
        if (!parsed.success) throw new ApiError("VALIDATION", parsed.error.issues[0].message);
        const p = db.personalProfiles.find((x) => x.userId === user.id) ?? db.agentProfiles.find((x) => x.userId === user.id);
        if (!p) throw new ApiError("VALIDATION", "Business address changes require re-verification. Contact support.");
        p.address = parsed.data;
      }
      if (input.language !== undefined) {
        const parsed = languageSchema.safeParse(input.language);
        if (!parsed.success) throw new ApiError("VALIDATION", parsed.error.issues[0].message);
        user.language = parsed.data;
      }
      user.updatedAt = new Date().toISOString();
      audit(db, { actor: user, action: "PROFILE_UPDATED", target: user.id });
      return toProfileView(db, user);
    });
  },
  async setAvatar(uploadId) {
    const userId = await read((db) => requireCaller(db).user.id);
    const avatarId = uploadId ? await ownAvatar(uploadId, userId) : null;
    const view = await write((db) => {
      const { user } = requireCaller(db);
      user.avatarId = avatarId;
      user.updatedAt = new Date().toISOString();
      audit(db, { actor: user, action: "PROFILE_UPDATED", target: user.id, metadata: { profilePicture: avatarId ? "updated" : "removed" } });
      return toProfileView(db, user);
    });
    await cleanUpAvatars(userId, avatarId);
    return view;
  },
};

type Fail = { error: ApiError } | { ok: true };
const done = (o: Fail) => {
  if ("error" in o) throw o.error;
};

export const security: SecurityApi = {
  async changePassword({ currentPassword, newPassword }) {
    const parsed = passwordSchema.safeParse(newPassword);
    if (!parsed.success) throw new ApiError("VALIDATION", parsed.error.issues[0].message);
    done(
      await write<Fail>(async (db) => {
        const { user, session } = requireCaller(db);
        if (!(await verifySecret(currentPassword, user.passwordHash))) {
          audit(db, { actor: user, action: "PASSWORD_CHANGE_FAILED", target: user.id });
          return { error: new ApiError("INVALID_CREDENTIALS", "Current password is incorrect.") };
        }
        if (await verifySecret(newPassword, user.passwordHash)) {
          return { error: new ApiError("VALIDATION", "New password must be different from the current one.") };
        }
        user.passwordHash = await hashSecret(newPassword);
        user.updatedAt = new Date().toISOString();
        for (const s of db.sessions) if (s.userId === user.id && s.id !== session.id && !s.revokedAt) s.revokedAt = user.updatedAt;
        notify(db, user.id, "SECURITY_ALERT", "Password changed", "Your password was changed and other devices were signed out.", "/profile?tab=security");
        audit(db, { actor: user, action: "PASSWORD_CHANGED", target: user.id });
        return { ok: true };
      }),
    );
  },

  async requestPinChangeOtp() {
    return write(async (db) => {
      const { user } = requireCaller(db);
      return issueOtp(db, { purpose: "CHANGE_PIN", destination: user.phone, userId: user.id, context: `pin:${user.id}` });
    });
  },

  async changePin({ currentPin, newPin, challengeId, code }) {
    const parsed = pinSchema.safeParse(newPin);
    if (!parsed.success) throw new ApiError("VALIDATION", parsed.error.issues[0].message);
    done(
      await write<Fail>(async (db) => {
        const { user } = requireCaller(db);
        if (user.pinLockedUntil && Date.parse(user.pinLockedUntil) > Date.now()) {
          return { error: new ApiError("PIN_LOCKED", "PIN is locked. Try again later.") };
        }
        if (!(await verifySecret(currentPin, user.pinHash))) {
          user.pinFailedCount += 1;
          if (user.pinFailedCount >= SECURITY.pinMaxAttempts) {
            user.pinFailedCount = 0;
            user.pinLockedUntil = new Date(Date.now() + SECURITY.pinLockMinutes * 60_000).toISOString();
          }
          return { error: new ApiError("INVALID_PIN", "Current PIN is incorrect.") };
        }
        const err = await checkOtp(db, { challengeId, code, purpose: "CHANGE_PIN", context: `pin:${user.id}` });
        if (err) return { error: err };
        user.pinHash = await hashSecret(newPin);
        user.pinFailedCount = 0;
        notify(db, user.id, "SECURITY_ALERT", "PIN changed", "Your transaction PIN was changed.", "/profile?tab=security");
        audit(db, { actor: user, action: "PIN_CHANGED", target: user.id });
        return { ok: true };
      }),
    );
  },

  async requestTwoFactorOtp() {
    return write(async (db) => {
      const { user } = requireCaller(db);
      return issueOtp(db, { purpose: "ENABLE_2FA", destination: user.phone, userId: user.id, context: `2fa:${user.id}` });
    });
  },

  async setTwoFactor({ enabled, challengeId, code, password }) {
    done(
      await write<Fail>(async (db) => {
        const { user } = requireCaller(db);
        if (!(await verifySecret(password, user.passwordHash))) {
          return { error: new ApiError("INVALID_CREDENTIALS", "Password is incorrect.") };
        }
        if (enabled) {
          if (!challengeId || !code) return { error: new ApiError("OTP_REQUIRED", "Enter the code we sent to your phone.") };
          const err = await checkOtp(db, { challengeId, code, purpose: "ENABLE_2FA", context: `2fa:${user.id}` });
          if (err) return { error: err };
        } else if (user.role === "ADMIN") {
          return { error: new ApiError("FORBIDDEN", "Two-factor authentication is mandatory for admin accounts.") };
        }
        user.twoFactorEnabled = enabled;
        notify(db, user.id, "SECURITY_ALERT", enabled ? "Two-factor sign-in enabled" : "Two-factor sign-in disabled", enabled ? "You'll be asked for a one-time code when you sign in." : "Sign-in no longer requires a one-time code.", "/profile?tab=security");
        audit(db, { actor: user, action: enabled ? "TWO_FACTOR_ENABLED" : "TWO_FACTOR_DISABLED", target: user.id });
        return { ok: true };
      }),
    );
  },

  async sessions(): Promise<SessionView[]> {
    return read((db) => {
      const { user, session } = requireCaller(db);
      const now = Date.now();
      return db.sessions
        .filter((s) => s.userId === user.id && !s.revokedAt && Date.parse(s.expiresAt) > now)
        .sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt))
        .map((s) => ({
          id: s.id,
          device: s.device,
          location: s.location,
          ipMasked: maskIp(s.ip),
          createdAt: s.createdAt,
          lastActiveAt: s.lastActiveAt,
          current: s.id === session.id,
        }));
    });
  },

  async revokeSession(sessionId) {
    await write((db) => {
      const { user, session } = requireCaller(db);
      const s = db.sessions.find((x) => x.id === sessionId && x.userId === user.id);
      if (!s) throw new ApiError("NOT_FOUND", "Session not found.");
      if (s.id === session.id) throw new ApiError("VALIDATION", "Use Sign out to end the current session.");
      s.revokedAt = new Date().toISOString();
      audit(db, { actor: user, action: "SESSION_REVOKED", target: s.id, metadata: { device: s.device } });
    });
  },

  async logoutAll() {
    await write((db) => {
      const { user } = requireCaller(db);
      const now = new Date().toISOString();
      for (const s of db.sessions) if (s.userId === user.id && !s.revokedAt) s.revokedAt = now;
      audit(db, { actor: user, action: "LOGOUT_ALL_DEVICES", target: user.id });
    });
    clearSessionCookie();
  },

  async loginHistory(): Promise<LoginEvent[]> {
    return read((db) => {
      const { user } = requireCaller(db);
      return db.auditLogs
        .filter((a) => a.target === user.id && (a.action === "LOGIN_SUCCESS" || a.action === "LOGIN_FAILED" || a.action === "LOGIN_BLOCKED"))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 20)
        .map((a) => ({
          id: a.id,
          success: a.action === "LOGIN_SUCCESS",
          method: a.metadata.method === "PASSWORD_OTP" ? "PASSWORD_OTP" : "PASSWORD",
          device: String(a.metadata.device ?? "Unknown device"),
          location: "Dhaka, BD (approx.)",
          ipMasked: maskIp(a.ip),
          reason: a.metadata.reason ? String(a.metadata.reason) : null,
          createdAt: a.createdAt,
        }));
    });
  },
};

/* ───────────── Role dashboards ───────────── */

export const personal: PersonalApi = {
  async dashboard() {
    return write((db) => {
      settleDue(db);
      return personalDashboard(db, requireCaller(db, ["PERSONAL"]).user);
    });
  },
  async recentRecipients() {
    return read((db) => {
      const { user } = requireCaller(db, ["PERSONAL"]);
      const seen = new Map<string, { name: string; userId: string | null }>();
      for (const t of [...db.transactions].sort(newestFirst)) {
        if (t.type === "SEND_MONEY" && t.sender.userId === user.id && t.status === "SUCCESSFUL" && !seen.has(t.receiver.account)) {
          seen.set(t.receiver.account, { name: t.receiver.name, userId: t.receiver.userId });
        }
        if (seen.size >= 6) break;
      }
      // The user's own send history — they entered these numbers themselves.
      return [...seen.entries()].map(([phone, r]) => ({ name: r.name, phone, avatarUrl: partyAvatarUrl(db, r.userId) }));
    });
  },
};

function settlementViews(db: DbState, userId: string): SettlementView[] {
  return db.transactions
    .filter((t) => t.type === "SETTLEMENT" && (t.sender.userId === userId || t.receiver.userId === userId))
    .sort(newestFirst)
    .map((t) => ({
      id: t.id,
      trxId: t.trxId,
      direction: t.settlementDirection ?? (t.sender.userId === userId ? "TO_BANK" : "FLOAT_TOP_UP"),
      amount: t.amount,
      status: t.status,
      destination: t.settlementDirection === "FLOAT_TOP_UP" ? "E-money float" : `${t.receiver.name} ${t.receiver.account}`,
      createdAt: t.createdAt,
      completedAt: t.completedAt,
    }));
}

export const agent: AgentApi = {
  async dashboard() {
    return write((db) => {
      settleDue(db);
      return agentDashboard(db, requireCaller(db, ["AGENT"]).user);
    });
  },
  async commissions() {
    return read((db) => commissionSummary(db, requireCaller(db, ["AGENT"]).user));
  },
  async settlements() {
    return write((db) => {
      settleDue(db);
      return settlementViews(db, requireCaller(db, ["AGENT"]).user.id);
    });
  },
};

/* ───────────── Merchant (incl. dynamic QR) ───────────── */

function requireVerifiedMerchant(user: UserRecord) {
  if (user.status !== "VERIFIED") {
    throw new ApiError("ACCOUNT_NOT_VERIFIED", "Merchant payments are enabled after your business is verified.");
  }
}

function expireRequests(db: DbState) {
  const now = Date.now();
  for (const p of db.paymentRequests) if (p.status === "AWAITING" && Date.parse(p.expiresAt) <= now) p.status = "EXPIRED";
}

function toRequestView(db: DbState, p: PaymentRequestRecord, viewerId: string) {
  const biz = db.merchantBusinesses.find((b) => b.userId === p.merchantUserId)!;
  return {
    id: p.id,
    amount: p.amount,
    note: p.note,
    status: p.status,
    qrPayload: qrCodec.encodeDynamic(biz.merchantId, biz.businessName, p.id, p.amount),
    createdAt: p.createdAt,
    expiresAt: p.expiresAt,
    paidAt: p.paidAt,
    trxId: p.trxId,
    payer: p.payer
      ? { name: p.payer.name, account: p.payer.userId === viewerId ? p.payer.account : maskPhone(p.payer.account), kind: p.payer.kind }
      : null,
  };
}

function ownRequest(db: DbState, id: string, userId: string) {
  const p = db.paymentRequests.find((x) => x.id === id && x.merchantUserId === userId);
  if (!p) throw new ApiError("NOT_FOUND", "Payment request not found.");
  return p;
}

export const merchant: MerchantApi = {
  async dashboard() {
    return write((db) => {
      settleDue(db);
      return merchantDashboard(db, requireCaller(db, ["MERCHANT"]).user);
    });
  },
  async qr() {
    return read((db) => {
      const { user } = requireCaller(db, ["MERCHANT"]);
      const biz = db.merchantBusinesses.find((b) => b.userId === user.id)!;
      return {
        merchantId: biz.merchantId,
        businessName: biz.businessName,
        category: biz.category,
        qrPayload: qrCodec.encodeStatic(biz.merchantId, biz.businessName),
        enabled: user.status === "VERIFIED",
      };
    });
  },
  async createPaymentRequest({ amount, note }) {
    return write((db) => {
      const { user } = requireCaller(db, ["MERCHANT"]);
      requireVerifiedMerchant(user);
      if (!Number.isInteger(amount) || amount < 100 || amount > 5_000_000) {
        throw new ApiError("VALIDATION", "Amount must be between ৳1 and ৳50,000.");
      }
      expireRequests(db);
      let id = "";
      do id = shortCode("PR");
      while (db.paymentRequests.some((p) => p.id === id));
      const now = Date.now();
      const rec: PaymentRequestRecord = {
        id,
        merchantUserId: user.id,
        amount,
        note: note?.trim().slice(0, 80) || null,
        status: "AWAITING",
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + SECURITY.paymentRequestMinutes * 60_000).toISOString(),
        paidAt: null,
        trxId: null,
        payer: null,
      };
      db.paymentRequests.push(rec);
      audit(db, { actor: user, action: "PAYMENT_REQUEST_CREATED", target: id, metadata: { amount } });
      return toRequestView(db, rec, user.id);
    });
  },
  async getPaymentRequest(id) {
    return write((db) => {
      const { user } = requireCaller(db, ["MERCHANT"]);
      expireRequests(db);
      return toRequestView(db, ownRequest(db, id, user.id), user.id);
    });
  },
  async listPaymentRequests() {
    return write((db) => {
      const { user } = requireCaller(db, ["MERCHANT"]);
      expireRequests(db);
      const since = Date.now() - 86_400_000;
      return db.paymentRequests
        .filter((p) => p.merchantUserId === user.id && Date.parse(p.createdAt) >= since)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((p) => toRequestView(db, p, user.id));
    });
  },
  async cancelPaymentRequest(id) {
    return write((db) => {
      const { user } = requireCaller(db, ["MERCHANT"]);
      const p = ownRequest(db, id, user.id);
      if (p.status === "AWAITING") p.status = "CANCELLED";
      return toRequestView(db, p, user.id);
    });
  },
  async simulateQrPayment(id) {
    return write((db) => {
      const { user } = requireCaller(db, ["MERCHANT"]);
      requireVerifiedMerchant(user);
      expireRequests(db);
      const p = ownRequest(db, id, user.id);
      if (p.status !== "AWAITING") throw new ApiError("CONFLICT", "This payment request is no longer awaiting payment.");
      const biz = db.merchantBusinesses.find((b) => b.userId === user.id)!;
      const payer = { userId: null, name: CUSTOMERS[Math.floor(Math.random() * CUSTOMERS.length)], account: `017${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, kind: "PERSONAL" as const };
      const t = post(db, {
        type: "MERCHANT_PAYMENT",
        sender: payer,
        receiver: { userId: user.id, name: biz.businessName, account: biz.merchantId, kind: "MERCHANT" },
        amount: p.amount,
        senderFee: computeFees("MERCHANT_PAYMENT", p.amount).senderFee,
        paymentMethod: "QR_SCAN",
        description: p.note ?? "QR payment",
        reference: p.id,
      });
      p.status = "PAID";
      p.paidAt = t.createdAt;
      p.trxId = t.trxId;
      p.payer = payer;
      notifyParties(db, t);
      audit(db, { actor: user, action: "DEV_SIMULATED_QR_PAYMENT", target: t.trxId, metadata: { amount: p.amount } });
      return toRequestView(db, p, user.id);
    });
  },
  async settlements() {
    return write((db) => {
      settleDue(db);
      return settlementViews(db, requireCaller(db, ["MERCHANT"]).user.id);
    });
  },
};

/* ───────────── Lookups ───────────── */

export const lookup: LookupApi = {
  async billers() {
    return BILLERS;
  },
  async fetchBill(billerId, accountNumber) {
    await read((db) => requireCaller(db, ["PERSONAL", "AGENT"]));
    const bill = await providers.billers.fetchBill(billerId, accountNumber.trim());
    if (!bill) throw new ApiError("NOT_FOUND", "No bill found for this account. Check the number and try again.");
    return bill;
  },
  async resolveMerchant(input) {
    return write((db) => {
      requireCaller(db, ["PERSONAL"]);
      expireRequests(db);
      const parsed = qrCodec.decode(input);
      const merchantId = (parsed?.merchantId ?? input).trim().toUpperCase();
      const biz = db.merchantBusinesses.find((b) => b.merchantId === merchantId);
      if (!biz) throw new ApiError("NOT_FOUND", "No merchant found. Check the Merchant ID or QR code.");
      const owner = db.users.find((u) => u.id === biz.userId)!;
      if (owner.status !== "VERIFIED") throw new ApiError("FORBIDDEN", `${biz.businessName} is not verified to receive payments yet.`);
      let paymentCode: string | null = null;
      let amount: number | null = null;
      if (parsed?.kind === "DYNAMIC" && parsed.paymentCode) {
        const pr = db.paymentRequests.find((p) => p.id === parsed.paymentCode && p.merchantUserId === biz.userId);
        if (!pr || pr.status !== "AWAITING") throw new ApiError("CONFLICT", "This QR payment request has expired or was already paid.");
        paymentCode = pr.id;
        amount = pr.amount;
      }
      return { merchantId: biz.merchantId, businessName: biz.businessName, paymentCode, amount };
    });
  },
};
