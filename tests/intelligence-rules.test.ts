import { beforeAll, describe, expect, it } from "vitest";
import { agentIntelligence, churnRanking } from "@/services/mock/intelligence";
import type { DbState, PartyRecord, TransactionRecord } from "@/services/mock/schema";
import { ID, T, fixtureDb } from "./helpers/harness";

/**
 * Edge cases of the intelligence rules on small hand-built data, where the
 * synthetic dataset can't be relied on to reach them.
 */

const NOW = Date.parse("2026-10-07T06:00:00.000Z");
const DAY = 86_400_000;
const HOUR = 3_600_000;
const party = (userId: string, kind: PartyRecord["kind"]): PartyRecord => ({ userId, name: userId, account: userId, kind });

let seq = 0;
function txn(p: Pick<TransactionRecord, "type" | "sender" | "receiver" | "amount"> & { at: number }): TransactionRecord {
  const createdAt = new Date(p.at).toISOString();
  return {
    id: `txn_${++seq}`, trxId: `TRX${String(seq).padStart(7, "0")}`, type: p.type, status: "SUCCESSFUL", amount: p.amount, senderFee: 0, receiverFee: 0,
    commission: null, sender: p.sender, receiver: p.receiver, description: "x", reference: null, paymentMethod: null, relatedTrxId: null,
    refundedAmount: 0, pendingHold: null, pendingCredit: null, cashEffect: null, settleAt: null, failureReason: null, createdAt, completedAt: createdAt,
    settlementDirection: null,
  };
}

let base: DbState;
beforeAll(async () => {
  base = await fixtureDb();
});

describe("agent anomalies: the peer median leaves the agent itself out", () => {
  it("flags off-hours activity even when that agent is the only active one", () => {
    const db = structuredClone(base);
    db.users.find((u) => u.id === ID.pendingAgent)!.status = "VERIFIED"; // a second agent, too quiet to count as a peer
    // 20 recharges at 02:00 Dhaka (20:00 UTC) over the last four weeks, and 3 daytime ones at the other agent.
    for (let i = 0; i < 20; i++) {
      db.transactions.push(txn({ type: "MOBILE_RECHARGE", sender: party(ID.agent, "AGENT"), receiver: { userId: null, name: "Robi", account: "01811111111", kind: "OPERATOR" }, amount: T(100), at: NOW - (i + 1) * DAY - 10 * HOUR }));
    }
    for (let i = 0; i < 3; i++) {
      db.transactions.push(txn({ type: "MOBILE_RECHARGE", sender: party(ID.pendingAgent, "AGENT"), receiver: { userId: null, name: "Robi", account: "01811111111", kind: "OPERATOR" }, amount: T(100), at: NOW - (i + 1) * DAY }));
    }
    const lonely = agentIntelligence(db, NOW).find((a) => a.userId === ID.agent)!;
    // Compared with itself, a 100% off-hours share could never reach 3× "the peer median".
    expect(lonely.flags.map((f) => f.code)).toContain("OFF_HOURS_ACTIVITY");
  });
});

describe("merchant churn: a merchant whose payments have stopped stays on the list", () => {
  it("ranks a merchant with a long history but almost no recent payments as HIGH risk", () => {
    const db = structuredClone(base);
    // Two payments a day from 80 to 40 days ago, then one 20 days ago.
    for (let d = 80; d > 40; d--) {
      for (const h of [2, 6]) db.transactions.push(txn({ type: "MERCHANT_PAYMENT", sender: party(ID.personal, "PERSONAL"), receiver: party(ID.merchant, "MERCHANT"), amount: T(500), at: NOW - d * DAY + h * HOUR }));
    }
    db.transactions.push(txn({ type: "MERCHANT_PAYMENT", sender: party(ID.personal, "PERSONAL"), receiver: party(ID.merchant, "MERCHANT"), amount: T(500), at: NOW - 20 * DAY }));
    const risk = churnRanking(db, NOW).find((r) => r.userId === ID.merchant);
    expect(risk).toMatchObject({ level: "HIGH", daysSinceLastPayment: 20 });
  });

  it("still leaves out a merchant with almost no history at all", () => {
    const db = structuredClone(base);
    db.transactions.push(txn({ type: "MERCHANT_PAYMENT", sender: party(ID.personal, "PERSONAL"), receiver: party(ID.merchant, "MERCHANT"), amount: T(500), at: NOW - 3 * DAY }));
    expect(churnRanking(db, NOW).find((r) => r.userId === ID.merchant)).toBeUndefined();
  });
});
