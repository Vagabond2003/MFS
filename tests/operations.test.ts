import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OperationRequest } from "@/types/domain";
import { operations } from "@/services/mock/handlers/operations";
import { ID, PHONE, PIN, T, balance, cash, fixtureDb, installHarness, newKey, run, type Harness } from "./helpers/harness";

const NOW = new Date("2026-10-07T06:00:00.000Z"); // noon in Dhaka
const send = (amount: number, to: string = PHONE.recipient): OperationRequest => ({ kind: "SEND_MONEY", to, amount });

let h: Harness;
beforeEach(async () => {
  // Pin the clock (Date only: PBKDF2 and the write queue keep real timers).
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.spyOn(console, "info").mockImplementation(() => {}); // the development SMS provider logs codes
  h = installHarness(await fixtureDb());
  h.signIn(ID.personal);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("quote and execute", () => {
  it("the server prices the operation; execute posts exactly what the quote showed", async () => {
    const quote = await operations.quote(send(T(2_000)));
    expect(quote).toMatchObject({ amount: T(2_000), fee: T(5), total: T(2_005), balanceAfter: T(100_000) - T(2_005), requiresOtp: false });
    const res = await operations.execute(send(T(2_000)), { pin: PIN, idempotencyKey: newKey() });
    expect(res.balanceAfter).toBe(quote.balanceAfter);
    expect(balance(h.db, ID.personal)).toBe(quote.balanceAfter);
    expect(balance(h.db, ID.recipient)).toBe(T(2_000));
    expect(h.db.transactions).toHaveLength(1);
  });

  it("an agent-assisted cash out moves the customer's money, the agent's float and cash, and the commission", async () => {
    h.signIn(ID.agent);
    await run({ kind: "AGENT_CASH_OUT", customer: PHONE.personal, amount: T(1_000) });
    expect(balance(h.db, ID.personal)).toBe(T(100_000) - T(1_018.5));
    expect(balance(h.db, ID.agent)).toBe(T(500_000) + T(1_000) + T(4));
    expect(cash(h.db, ID.agent)).toBe(T(300_000) - T(1_000));
  });
});

describe("idempotency keys", () => {
  it("a repeated key returns the first result and posts nothing new", async () => {
    const key = newKey();
    const first = await operations.execute(send(T(500)), { pin: PIN, idempotencyKey: key });
    const second = await operations.execute(send(T(500)), { pin: PIN, idempotencyKey: key });
    expect(second.transaction.trxId).toBe(first.transaction.trxId);
    expect(h.db.transactions).toHaveLength(1);
    expect(balance(h.db, ID.personal)).toBe(T(100_000) - T(500));
    expect(h.db.auditLogs.filter((a) => a.action === "TXN_SEND_MONEY")).toHaveLength(1);
  });

  it("concurrent double submits post once", async () => {
    const key = newKey();
    const results = await Promise.all([1, 2, 3].map(() => operations.execute(send(T(500)), { pin: PIN, idempotencyKey: key })));
    expect(new Set(results.map((r) => r.transaction.trxId)).size).toBe(1);
    expect(h.db.transactions).toHaveLength(1);
  });

  it("different keys are different transactions", async () => {
    await operations.execute(send(T(500)), { pin: PIN, idempotencyKey: newKey() });
    await operations.execute(send(T(500)), { pin: PIN, idempotencyKey: newKey() });
    expect(h.db.transactions).toHaveLength(2);
  });

  it("another user's key is refused", async () => {
    const key = newKey();
    await operations.execute(send(T(500)), { pin: PIN, idempotencyKey: key });
    h.signIn(ID.recipient);
    await expect(operations.execute(send(T(100), PHONE.personal), { pin: PIN, idempotencyKey: key })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(h.db.transactions).toHaveLength(1);
  });

  it("a request without a key is refused", async () => {
    await expect(operations.execute(send(T(500)), { pin: PIN, idempotencyKey: "" })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("a failed execution doesn't use up its key", async () => {
    const key = newKey();
    h.signIn(ID.recipient); // balance 0
    await expect(operations.execute(send(T(500), PHONE.personal), { pin: PIN, idempotencyKey: key })).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
    expect(h.db.idempotency[key]).toBeUndefined();
    await run({ kind: "ADD_MONEY", sourceId: "src_bank_demo", amount: T(1_000) });
    const res = await operations.execute(send(T(500), PHONE.personal), { pin: PIN, idempotencyKey: key });
    expect(res.transaction.amount).toBe(T(500));
  });
});

describe("rollback on failure", () => {
  it("a refused operation changes no balance and records no transaction", async () => {
    const before = structuredClone(h.db);
    await expect(run(send(T(100_001)))).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
    h.signIn(ID.recipient);
    await expect(run(send(T(10), PHONE.personal))).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
    expect(h.db.wallets).toEqual(before.wallets);
    expect(h.db.transactions).toEqual([]);
  });

  it("a wrong one-time code posts nothing but keeps the attempt count", async () => {
    const req = send(T(15_000)); // ≥ ৳10,000 needs a code
    const challenge = await operations.requestOtp(req);
    const wrong = challenge.devCode === "000000" ? "111111" : "000000";
    await expect(operations.execute(req, { pin: PIN, idempotencyKey: newKey(), otp: { challengeId: challenge.challengeId, code: wrong } })).rejects.toMatchObject({ code: "INVALID_OTP" });
    expect(h.db.transactions).toEqual([]);
    expect(balance(h.db, ID.personal)).toBe(T(100_000));
    expect(h.db.otpCodes.find((o) => o.id === challenge.challengeId)?.attempts).toBe(1);
  });

  it("a gateway decline is recorded as FAILED with no money moved", async () => {
    const res = await run({ kind: "ADD_MONEY", sourceId: "src_bank_demo", amount: T(500) + 13 }); // the dev gateway declines .13
    expect(res.transaction.status).toBe("FAILED");
    expect(balance(h.db, ID.personal)).toBe(T(100_000));
  });
});

describe("fee and limit boundaries", () => {
  it("Send Money is free up to ৳1,000", async () => {
    expect((await operations.quote(send(T(1_000)))).fee).toBe(0);
    expect((await operations.quote(send(T(1_000) + 1))).fee).toBe(T(5));
  });

  it("minimum and maximum amount per operation", async () => {
    await expect(operations.quote(send(T(10)))).resolves.toBeTruthy();
    await expect(operations.quote(send(T(10) - 1))).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(operations.quote({ kind: "ADD_MONEY", sourceId: "src_bank_demo", amount: T(50_000) })).resolves.toBeTruthy();
    await expect(operations.quote({ kind: "ADD_MONEY", sourceId: "src_bank_demo", amount: T(50_000) + 1 })).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
  });

  it.each([0, -T(100), T(10) + 0.5])("refuses amount %s", async (amount) => {
    await expect(operations.quote(send(amount))).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("verified accounts: ৳25,000 per transaction including the fee", async () => {
    await expect(operations.quote(send(T(24_995)))).resolves.toMatchObject({ total: T(25_000) });
    await expect(operations.quote(send(T(24_995) + 1))).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
  });

  it("verified accounts: ৳50,000 a day", async () => {
    await run(send(T(24_995)));
    await run(send(T(24_995))); // ৳50,000 used, fees included
    await expect(operations.quote(send(T(10)))).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
    // The next day the allowance is back.
    vi.setSystemTime(new Date(NOW.getTime() + 86_400_000));
    await expect(operations.quote(send(T(10)))).resolves.toBeTruthy();
  });

  it("unverified accounts: ৳5,000 per transaction and ৳10,000 a day", async () => {
    h.signIn(ID.unverified);
    await expect(operations.quote(send(T(4_995)))).resolves.toMatchObject({ total: T(5_000) });
    await expect(operations.quote(send(T(4_995) + 1))).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
    await run(send(T(4_995)));
    await run(send(T(4_995)));
    await expect(operations.quote(send(T(10)))).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
  });

  it("a one-time code is needed from ৳10,000 including the fee", async () => {
    expect((await operations.quote(send(T(9_995) - 1))).requiresOtp).toBe(false); // ৳9,999.99
    expect((await operations.quote(send(T(9_995)))).requiresOtp).toBe(true); // ৳10,000.00
    await expect(operations.execute(send(T(9_995)), { pin: PIN, idempotencyKey: newKey() })).rejects.toMatchObject({ code: "OTP_REQUIRED" });
  });

  it("can't spend more than the balance", async () => {
    h.signIn(ID.merchant);
    await expect(operations.quote({ kind: "SETTLEMENT", direction: "TO_BANK", amount: T(5_000) })).resolves.toMatchObject({ balanceAfter: 0 });
    await expect(operations.quote({ kind: "SETTLEMENT", direction: "TO_BANK", amount: T(5_000) + 1 })).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
  });

  it("an agent can't pay out more cash than the outlet has", async () => {
    h.signIn(ID.agent);
    await expect(operations.quote({ kind: "AGENT_CASH_OUT", customer: PHONE.personal, amount: T(20_000) })).resolves.toBeTruthy();
    await run({ kind: "SETTLEMENT", direction: "FLOAT_TOP_UP", amount: T(290_000) }); // cash ৳300,000 → ৳10,000
    await expect(operations.quote({ kind: "AGENT_CASH_OUT", customer: PHONE.personal, amount: T(10_000) + 1 })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("PIN lockout", () => {
  const wrong = (key = newKey()) => operations.execute(send(T(100)), { pin: "11111", idempotencyKey: key });
  const right = () => operations.execute(send(T(100)), { pin: PIN, idempotencyKey: newKey() });
  const me = () => h.db.users.find((u) => u.id === ID.personal)!;

  it("counts wrong PINs across requests and locks for 15 minutes after the third", async () => {
    await expect(wrong()).rejects.toMatchObject({ code: "INVALID_PIN", details: { attemptsLeft: 2 } });
    await expect(wrong()).rejects.toMatchObject({ code: "INVALID_PIN", details: { attemptsLeft: 1 } });
    await expect(wrong()).rejects.toMatchObject({ code: "PIN_LOCKED" });
    expect(me().pinLockedUntil).toBe(new Date(NOW.getTime() + 15 * 60_000).toISOString());
    expect(h.db.notifications.filter((n) => n.userId === ID.personal && n.type === "SECURITY_ALERT")).toHaveLength(1);

    // Even the right PIN is refused while locked.
    await expect(right()).rejects.toMatchObject({ code: "PIN_LOCKED" });
    vi.setSystemTime(new Date(NOW.getTime() + 15 * 60_000 - 1));
    await expect(right()).rejects.toMatchObject({ code: "PIN_LOCKED" });
    vi.setSystemTime(new Date(NOW.getTime() + 15 * 60_000 + 1));
    await expect(right()).resolves.toBeTruthy();
    expect(h.db.transactions).toHaveLength(1);
  });

  it("a wrong PIN posts nothing, and a correct one resets the count", async () => {
    await expect(wrong()).rejects.toMatchObject({ code: "INVALID_PIN" });
    await expect(wrong()).rejects.toMatchObject({ code: "INVALID_PIN" });
    expect(h.db.transactions).toEqual([]);
    expect(me().pinFailedCount).toBe(2);
    await right();
    expect(me().pinFailedCount).toBe(0);
    await expect(wrong()).rejects.toMatchObject({ code: "INVALID_PIN", details: { attemptsLeft: 2 } });
  });

  it.each(["", "2468", "246800", "abcde"])("refuses malformed PIN %j as a wrong attempt", async (pin) => {
    await expect(operations.execute(send(T(100)), { pin, idempotencyKey: newKey() })).rejects.toMatchObject({ code: "INVALID_PIN" });
    expect(me().pinFailedCount).toBe(1);
  });
});

describe("role refusal", () => {
  it.each([
    ["a customer", ID.personal, { kind: "AGENT_CASH_IN", customer: PHONE.recipient, amount: T(500) }],
    ["a customer", ID.personal, { kind: "SETTLEMENT", direction: "TO_BANK", amount: T(500) }],
    ["a customer", ID.personal, { kind: "MERCHANT_REFUND", trxId: "ABCDEFGHJK", amount: T(10), reason: "Wrong item" }],
    ["an agent", ID.agent, send(T(500), PHONE.personal)],
    ["an agent", ID.agent, { kind: "ADD_MONEY", sourceId: "src_bank_demo", amount: T(500) }],
    ["a merchant", ID.merchant, { kind: "CASH_OUT", agentNumber: PHONE.agent, amount: T(500) }],
    ["a merchant", ID.merchant, { kind: "SETTLEMENT", direction: "FLOAT_TOP_UP", amount: T(500) }],
  ] as [string, string, OperationRequest][])("%s can't do %j", async (_, userId, req) => {
    h.signIn(userId);
    await expect(operations.quote(req)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(operations.execute(req, { pin: PIN, idempotencyKey: newKey() })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(h.db.transactions).toEqual([]);
  });

  it("the role comes from the database, not the session cookie", async () => {
    h.signIn(ID.personal, "AGENT");
    await expect(operations.quote({ kind: "AGENT_CASH_IN", customer: PHONE.recipient, amount: T(500) })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("an agent under review can't transact", async () => {
    h.signIn(ID.pendingAgent);
    await expect(operations.quote({ kind: "AGENT_CASH_IN", customer: PHONE.personal, amount: T(500) })).rejects.toMatchObject({ code: "ACCOUNT_NOT_VERIFIED" });
  });

  it("a customer can't cash out at an agent under review", async () => {
    await expect(operations.quote({ kind: "CASH_OUT", agentNumber: PHONE.pendingAgent, amount: T(500) })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("signed out → refused", async () => {
    h.signIn(null);
    await expect(operations.quote(send(T(500)))).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(operations.execute(send(T(500)), { pin: PIN, idempotencyKey: newKey() })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("a suspended account is signed out and can't receive money", async () => {
    const suspend = (id: string) => (h.db.users.find((u) => u.id === id)!.status = "SUSPENDED");
    suspend(ID.recipient);
    await expect(operations.quote(send(T(500)))).rejects.toMatchObject({ code: "FORBIDDEN" });
    suspend(ID.personal);
    await expect(operations.quote(send(T(500), PHONE.unverified))).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});
