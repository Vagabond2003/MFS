import { beforeEach, describe, expect, it } from "vitest";
import { post, settleDue, walletOf } from "@/services/mock/ledger";
import type { DbState, PartyRecord } from "@/services/mock/schema";
import { write } from "@/services/mock/store";
import { ID, T, balance, cash, fixtureDb, installHarness, type Harness } from "./helpers/harness";

const party = (userId: string, kind: PartyRecord["kind"] = "PERSONAL"): PartyRecord => ({ userId, name: userId, account: userId, kind });
const BANK: PartyRecord = { userId: null, name: "Demo Bank", account: "•••• 4521", kind: "BANK" };
const AT = "2026-10-07T06:00:00.000Z";

let h: Harness;
let db: DbState; // a scratch copy for direct post() calls
beforeEach(async () => {
  h = installHarness(await fixtureDb());
  db = structuredClone(h.db);
});

describe("post()", () => {
  it("moves amount, fee, commission and cash together", () => {
    const before = { customer: balance(db, ID.personal), agent: balance(db, ID.agent), cash: cash(db, ID.agent) };
    const t = post(db, {
      type: "CASH_OUT", sender: party(ID.personal), receiver: party(ID.agent, "AGENT"), amount: T(1_000), senderFee: T(18.5),
      commission: { userId: ID.agent, amount: T(4) }, cashEffect: { userId: ID.agent, delta: -T(1_000) }, description: "Cash Out", createdAt: AT,
    });
    expect(balance(db, ID.personal)).toBe(before.customer - T(1_018.5));
    expect(balance(db, ID.agent)).toBe(before.agent + T(1_000) + T(4));
    expect(cash(db, ID.agent)).toBe(before.cash! - T(1_000));
    expect(db.commissions).toEqual([expect.objectContaining({ agentId: ID.agent, trxId: t.trxId, amount: T(4), baseAmount: T(1_000) })]);
    expect(t).toMatchObject({ status: "SUCCESSFUL", completedAt: AT, cashEffect: { userId: ID.agent, delta: -T(1_000) } });
  });

  it("credits the receiver net of the receiver fee", () => {
    post(db, { type: "MERCHANT_PAYMENT", sender: party(ID.personal), receiver: party(ID.merchant, "MERCHANT"), amount: T(100), receiverFee: T(1), description: "x" });
    expect(balance(db, ID.merchant)).toBe(T(5_000) + T(99));
  });

  it.each([0, -100, 10.5, Number.NaN])("refuses amount %s before touching any balance", (amount) => {
    const before = structuredClone(db);
    expect(() => post(db, { type: "SEND_MONEY", sender: party(ID.personal), receiver: party(ID.recipient), amount, description: "x" })).toThrow(
      expect.objectContaining({ code: "VALIDATION" }),
    );
    expect(db).toEqual(before);
  });

  it("refuses to overdraw, without changing anything", () => {
    const before = structuredClone(db);
    expect(() => post(db, { type: "SEND_MONEY", sender: party(ID.recipient), receiver: party(ID.personal), amount: 1, description: "x" })).toThrow(
      expect.objectContaining({ code: "INSUFFICIENT_FUNDS" }),
    );
    expect(db).toEqual(before);
  });

  it("refuses to pay out more physical cash than the outlet has recorded", () => {
    expect(() =>
      post(db, {
        type: "CASH_OUT", sender: party(ID.personal), receiver: party(ID.agent, "AGENT"), amount: T(1_000),
        cashEffect: { userId: ID.agent, delta: -(T(300_000) + 1) }, description: "x",
      }),
    ).toThrow(expect.objectContaining({ code: "INSUFFICIENT_FUNDS" }));
  });

  it("records FAILED transactions with no balance effect and no commission", () => {
    const before = db.wallets.map((w) => ({ ...w }));
    const t = post(db, {
      type: "CASH_OUT", status: "FAILED", sender: party(ID.personal), receiver: party(ID.agent, "AGENT"), amount: T(500), senderFee: T(9.25),
      commission: { userId: ID.agent, amount: T(2) }, cashEffect: { userId: ID.agent, delta: -T(500) }, description: "x", failureReason: "Declined",
    });
    expect(db.wallets).toEqual(before);
    expect(db.commissions).toEqual([]);
    expect(t).toMatchObject({ status: "FAILED", commission: null, cashEffect: null, completedAt: null });
  });

  it("gives every transaction a distinct TrxID", () => {
    const ids = Array.from({ length: 200 }, () => post(db, { type: "ADD_MONEY", sender: BANK, receiver: party(ID.recipient), amount: 100, description: "x" }).trxId);
    expect(new Set(ids).size).toBe(200);
  });
});

describe("pending settlements", () => {
  it("TO_BANK holds the funds, then settleDue clears the hold when the time comes", () => {
    const t = post(db, {
      type: "SETTLEMENT", status: "PENDING", sender: party(ID.merchant, "MERCHANT"), receiver: BANK, amount: T(1_000), holdSender: true,
      settleAt: "2026-10-07T06:02:00.000Z", description: "Settlement to bank", createdAt: AT,
    });
    expect(walletOf(db, ID.merchant)).toMatchObject({ available: T(4_000), pending: T(1_000) });
    expect(settleDue(db, Date.parse("2026-10-07T06:01:59.999Z"))).toEqual([]);
    expect(settleDue(db, Date.parse("2026-10-07T06:02:00.000Z"))).toEqual([t]);
    expect(walletOf(db, ID.merchant)).toMatchObject({ available: T(4_000), pending: 0 });
    expect(t).toMatchObject({ status: "SUCCESSFUL", completedAt: "2026-10-07T06:02:00.000Z" });
  });

  it("FLOAT_TOP_UP takes the cash now and credits the float when it clears", () => {
    post(db, {
      type: "SETTLEMENT", status: "PENDING", sender: BANK, receiver: party(ID.agent, "AGENT"), amount: T(20_000), creditReceiverOnSettle: true,
      cashEffect: { userId: ID.agent, delta: -T(20_000) }, settleAt: AT, description: "Float top-up", createdAt: AT,
    });
    expect(walletOf(db, ID.agent)).toMatchObject({ available: T(500_000), pending: T(20_000), cashInHand: T(280_000) });
    settleDue(db, Date.parse(AT));
    expect(walletOf(db, ID.agent)).toMatchObject({ available: T(520_000), pending: 0, cashInHand: T(280_000) });
  });
});

describe("rollback: a write either commits whole or not at all", () => {
  it("a posting that fails half-way leaves the committed state untouched", async () => {
    const before = structuredClone(h.db);
    // Debit and credit are applied to the draft, then the cash movement fails (the agent has ৳300,000 in cash).
    await expect(
      write((draft) =>
        post(draft, {
          type: "CASH_OUT", sender: party(ID.personal), receiver: party(ID.agent, "AGENT"), amount: T(50_000), senderFee: T(925),
          commission: { userId: ID.agent, amount: T(200) }, cashEffect: { userId: ID.agent, delta: -T(400_000) }, description: "x",
        }),
      ),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
    expect(h.db).toEqual(before);
  });

  it("a write that breaks a ledger invariant is rolled back", async () => {
    const before = structuredClone(h.db);
    await expect(
      write((draft) => {
        post(draft, { type: "ADD_MONEY", sender: BANK, receiver: party(ID.recipient), amount: T(10), description: "x" });
        walletOf(draft, ID.recipient).available += 0.5; // not a whole poisha
      }),
    ).rejects.toThrow(/Ledger invariant/);
    expect(h.db).toEqual(before);
  });

  it("a write that throws after posting is rolled back too", async () => {
    const before = structuredClone(h.db);
    await expect(
      write((draft) => {
        post(draft, { type: "SEND_MONEY", sender: party(ID.personal), receiver: party(ID.recipient), amount: T(100), description: "x" });
        throw new Error("later step failed");
      }),
    ).rejects.toThrow("later step failed");
    expect(h.db).toEqual(before);
  });
});
