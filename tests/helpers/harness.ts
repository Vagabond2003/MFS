import type { OperationAuth, OperationRequest, Role } from "@/types/domain";
import { hashSecret } from "@/services/mock/crypto";
import { operations } from "@/services/mock/handlers/operations";
import { setRequestEnvProvider, type OutgoingEmail, type RequestEnv } from "@/services/mock/runtime";
import type { DbState, SessionRecord, UserRecord, WalletRecord } from "@/services/mock/schema";
import { assertInvariants, setStoreBackend, type StoreBackend } from "@/services/mock/store";

/**
 * Runs the real API handlers without PostgreSQL:
 *   - an in-memory StoreBackend with the semantics of src/server/db-store.ts
 *     (writes are serialised; the handler mutates a structuredClone; ledger
 *     invariants are checked; only then is the copy committed; any throw
 *     discards it);
 *   - a RequestEnv whose session claims belong to whichever user `signIn` picked.
 */

export const PIN = "24680";
export const T = (taka: number) => Math.round(taka * 100); // taka → poisha

export interface Harness {
  /** The committed state (what a later request would see). */
  readonly db: DbState;
  signIn(userId: string | null, claimedRole?: Role): void;
  emails: OutgoingEmail[];
  /** Session-cookie changes the handlers asked for, in order. */
  cookies: ("set" | "clear")[];
}

export function installHarness(initial: DbState): Harness {
  let state = structuredClone(initial);
  let queue: Promise<unknown> = Promise.resolve();
  const backend: StoreBackend = {
    async read(fn) {
      return fn(state);
    },
    write(fn) {
      const run = queue.then(async () => {
        const draft = structuredClone(state);
        const result = await fn(draft);
        assertInvariants(draft);
        state = draft;
        return result;
      });
      queue = run.catch(() => undefined);
      return run;
    },
  };
  setStoreBackend(backend);

  let caller: { sid: string; role: Role } | null = null;
  const emails: OutgoingEmail[] = [];
  const cookies: Harness["cookies"] = [];
  const env: RequestEnv = {
    claims: () => (caller ? { ...caller, exp: Math.floor(Date.now() / 1000) + 3600 } : null),
    setSession: () => void cookies.push("set"),
    clearSession: () => void cookies.push("clear"),
    userAgent: () => "vitest",
    ip: () => "127.0.0.1",
    lang: () => "en",
    emailEnabled: () => false,
    queueEmail: (e) => emails.push(e),
    smsEnabled: () => false,
    queueSms: () => {},
  };
  setRequestEnvProvider(() => env);

  return {
    get db() {
      return state;
    },
    signIn(userId, claimedRole) {
      if (!userId) return void (caller = null);
      const session = state.sessions.find((s) => s.userId === userId)!;
      const user = state.users.find((u) => u.id === userId)!;
      // The role in the cookie is only a hint: handlers read it from the users table.
      caller = { sid: session.id, role: claimedRole ?? user.role };
    },
    emails,
    cookies,
  };
}

/* ───────────── Fixture ───────────── */

export const ID = {
  personal: "usr_personal",
  recipient: "usr_recipient",
  unverified: "usr_unverified",
  agent: "usr_agent",
  pendingAgent: "usr_pending_agent",
  merchant: "usr_merchant",
} as const;

export const PHONE = {
  personal: "01700000001",
  recipient: "01700000002",
  unverified: "01700000003",
  agent: "01800000001",
  pendingAgent: "01800000002",
  merchant: "01900000001",
} as const;

let pinHash: Promise<string> | null = null;

/** One account per role/status the tests need, each with a live session. Balances in poisha. */
export async function fixtureDb(): Promise<DbState> {
  const hash = await (pinHash ??= hashSecret(PIN));
  const created = "2026-01-01T00:00:00.000Z";
  const user = (id: string, role: Role, phone: string, status: UserRecord["status"]): UserRecord => ({
    id, role, name: id, phone, email: null, passwordHash: hash, pinHash: hash, status, twoFactorEnabled: false, isDemo: true,
    failedLoginCount: 0, lockedUntil: null, pinFailedCount: 0, pinLockedUntil: null, createdAt: created, updatedAt: created, lastLoginAt: null,
  });
  const wallet = (userId: string, available: number, cashInHand: number | null = null): WalletRecord => ({
    id: `wal_${userId}`, userId, currency: "BDT", available, savings: 0, pending: 0, cashInHand, version: 0, updatedAt: created,
  });
  const users = [
    user(ID.personal, "PERSONAL", PHONE.personal, "VERIFIED"),
    user(ID.recipient, "PERSONAL", PHONE.recipient, "VERIFIED"),
    user(ID.unverified, "PERSONAL", PHONE.unverified, "PENDING_VERIFICATION"),
    user(ID.agent, "AGENT", PHONE.agent, "VERIFIED"),
    user(ID.pendingAgent, "AGENT", PHONE.pendingAgent, "UNDER_REVIEW"),
    user(ID.merchant, "MERCHANT", PHONE.merchant, "VERIFIED"),
  ];
  const session = (u: UserRecord): SessionRecord => ({
    id: `ses_${u.id}`, userId: u.id, device: "vitest", location: "test", ip: "127.0.0.1", remember: false,
    createdAt: created, lastActiveAt: created, expiresAt: "2099-01-01T00:00:00.000Z", revokedAt: null,
  });
  const agentProfile = (userId: string, outletName: string) => ({
    userId, agentCode: `AG-${userId}`, dateOfBirth: "1990-01-01", address: "Mirpur, Dhaka", outletName, businessAddress: "Mirpur, Dhaka",
    emergencyName: "x", emergencyRelation: "Spouse", emergencyPhone: "01711111111", nidNumber: "1234567890123", reviewNote: null,
  });
  return {
    version: 5,
    seededAt: created,
    users,
    personalProfiles: [],
    agentProfiles: [agentProfile(ID.agent, "Test Telecom"), agentProfile(ID.pendingAgent, "Pending Telecom")],
    merchantProfiles: [],
    merchantBusinesses: [{
      id: "biz_merchant", userId: ID.merchant, merchantId: "MR-40001", businessName: "Test Shop", category: "GROCERY", businessAddress: "Dhaka",
      registrationNumber: "C-1", tradeLicenseNumber: "T-1", taxId: null, settlementAccount: "City Bank •1234",
    }],
    statusHistory: [],
    documents: [],
    wallets: [
      wallet(ID.personal, T(100_000)),
      wallet(ID.recipient, 0),
      wallet(ID.unverified, T(20_000)),
      wallet(ID.agent, T(500_000), T(300_000)),
      wallet(ID.pendingAgent, T(10_000), T(10_000)),
      wallet(ID.merchant, T(5_000)),
    ],
    transactions: [],
    commissions: [],
    notifications: [],
    otpCodes: [],
    sessions: users.map(session),
    auditLogs: [],
    disputes: [],
    paymentRequests: [],
    aiInsights: [],
    rateLimits: {},
    idempotency: {},
  };
}

/* ───────────── Calling the operations API ───────────── */

let keySeq = 0;
export const newKey = () => `idem_test_${++keySeq}`;

/**
 * quote → (OTP if the quote asks for one, using the development SMS provider's
 * on-screen code) → execute. Returns what execute returns.
 */
export async function run(req: OperationRequest, auth: Partial<OperationAuth> = {}) {
  const quote = await operations.quote(req);
  let otp = auth.otp;
  if (quote.requiresOtp && !otp) {
    const challenge = await operations.requestOtp(req);
    otp = { challengeId: challenge.challengeId, code: challenge.devCode! };
  }
  return operations.execute(req, { pin: PIN, idempotencyKey: newKey(), ...auth, otp });
}

export const balance = (db: DbState, userId: string) => db.wallets.find((w) => w.userId === userId)!.available;
export const cash = (db: DbState, userId: string) => db.wallets.find((w) => w.userId === userId)!.cashInHand;
