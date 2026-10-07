import { beforeEach, describe, expect, it } from "vitest";
import { insights } from "@/services/mock/handlers/insights";
import type { DbState, PartyRecord, TransactionRecord } from "@/services/mock/schema";
import { ID, T, fixtureDb, installHarness, type Harness } from "./helpers/harness";

/**
 * Admin confirm / dismiss on intelligence flags: stored in flag_reviews,
 * written to the audit log, shown back on the next load.
 */

const DAY = 86_400_000;
const HOUR = 3_600_000;
const ADMIN_ID = "usr_admin";
let seq = 0;
const party = (userId: string, kind: PartyRecord["kind"]): PartyRecord => ({ userId, name: userId, account: userId, kind });
function txn(p: Pick<TransactionRecord, "type" | "sender" | "receiver" | "amount"> & { at: number }): TransactionRecord {
  const createdAt = new Date(p.at).toISOString();
  return {
    id: `t${++seq}`, trxId: `TX${seq}`, type: p.type, status: "SUCCESSFUL", amount: p.amount, senderFee: 0, receiverFee: 0, commission: null,
    sender: p.sender, receiver: p.receiver, description: "x", reference: null, paymentMethod: null, relatedTrxId: null, refundedAmount: 0,
    pendingHold: null, pendingCredit: null, cashEffect: null, settleAt: null, failureReason: null, createdAt, completedAt: createdAt, settlementDirection: null,
  };
}

/** The fixture plus an admin, an agent with an off-hours pattern, and a merchant that stopped being paid. */
async function flaggedDb(): Promise<DbState> {
  const db = await fixtureDb();
  const admin = structuredClone(db.users[0]);
  Object.assign(admin, { id: ADMIN_ID, role: "ADMIN", status: "ACTIVE", phone: "01300000000", name: "Platform Admin" });
  db.users.push(admin);
  db.sessions.push({ ...db.sessions[0], id: "ses_admin", userId: ADMIN_ID });
  const now = Date.now();
  for (let i = 0; i < 20; i++) {
    db.transactions.push(txn({ type: "MOBILE_RECHARGE", sender: party(ID.agent, "AGENT"), receiver: { userId: null, name: "Robi", account: "x", kind: "OPERATOR" }, amount: T(100), at: now - (i + 1) * DAY - (now % DAY) + 20 * HOUR }));
  }
  db.users.find((u) => u.id === ID.merchant)!.createdAt = new Date(now - 400 * DAY).toISOString();
  for (let d = 21; d < 81; d++) db.transactions.push(txn({ type: "MERCHANT_PAYMENT", sender: party(ID.personal, "PERSONAL"), receiver: party(ID.merchant, "MERCHANT"), amount: T(500), at: now - d * DAY }));
  db.flagReviews = [];
  return db;
}

let h: Harness;
beforeEach(async () => {
  h = installHarness(await flaggedDb());
  h.signIn(ADMIN_ID);
});

describe("reviewing a flag", () => {
  it("the page shows raised flags with no decision yet", async () => {
    const agents = await insights.agentIntelligence();
    expect(agents.reviewsEnabled).toBe(true);
    const flag = agents.agents.find((a) => a.userId === ID.agent)!.flags.find((f) => f.code === "OFF_HOURS_ACTIVITY");
    expect(flag).toMatchObject({ review: null });
    const churn = await insights.churnRisk();
    expect(churn.merchants.find((m) => m.userId === ID.merchant)).toMatchObject({ level: "HIGH", review: null });
  });

  it("confirming an agent flag stores it, audit-logs it and shows it on the next load", async () => {
    const review = await insights.reviewFlag({ kind: "AGENT_FLAG", subjectUserId: ID.agent, code: "OFF_HOURS_ACTIVITY", decision: "CONFIRMED", note: "Checked with the outlet: night shift for a factory." });
    expect(review).toMatchObject({ decision: "CONFIRMED", reviewerName: "Platform Admin", note: "Checked with the outlet: night shift for a factory." });
    expect(h.db.flagReviews).toEqual([expect.objectContaining({ kind: "AGENT_FLAG", subjectUserId: ID.agent, code: "OFF_HOURS_ACTIVITY", decision: "CONFIRMED", reviewerId: ADMIN_ID, severity: "HIGH" })]);
    expect(h.db.auditLogs.at(-1)).toMatchObject({ actorId: ADMIN_ID, action: "FLAG_CONFIRMED", target: ID.agent, metadata: expect.objectContaining({ code: "OFF_HOURS_ACTIVITY", kind: "AGENT_FLAG" }) });
    const agents = await insights.agentIntelligence();
    expect(agents.agents.find((a) => a.userId === ID.agent)!.flags.find((f) => f.code === "OFF_HOURS_ACTIVITY")!.review).toMatchObject({ decision: "CONFIRMED" });
  });

  it("dismissing a churn flag works the same way, and a later decision replaces it on the page but not in the history", async () => {
    await insights.reviewFlag({ kind: "CHURN", subjectUserId: ID.merchant, code: "CHURN", decision: "DISMISSED" });
    expect(h.db.auditLogs.at(-1)).toMatchObject({ action: "FLAG_DISMISSED", target: ID.merchant });
    await insights.reviewFlag({ kind: "CHURN", subjectUserId: ID.merchant, code: "CHURN", decision: "CONFIRMED" });
    expect(h.db.flagReviews!.map((r) => r.decision)).toEqual(["DISMISSED", "CONFIRMED"]);
    const churn = await insights.churnRisk();
    expect(churn.merchants.find((m) => m.userId === ID.merchant)!.review).toMatchObject({ decision: "CONFIRMED" });
  });

  it("refuses a flag that isn't raised", async () => {
    await expect(insights.reviewFlag({ kind: "AGENT_FLAG", subjectUserId: ID.agent, code: "NEAR_LIMIT_CASH_OUTS", decision: "CONFIRMED" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(insights.reviewFlag({ kind: "CHURN", subjectUserId: ID.recipient, code: "CHURN", decision: "CONFIRMED" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(h.db.flagReviews).toEqual([]);
  });

  it.each([
    [{ decision: "MAYBE" }, "VALIDATION"],
    [{ kind: "SOMETHING" }, "VALIDATION"],
    [{ note: "x".repeat(301) }, "VALIDATION"],
  ])("refuses bad input %j", async (patch, code) => {
    const input = { kind: "AGENT_FLAG", subjectUserId: ID.agent, code: "OFF_HOURS_ACTIVITY", decision: "CONFIRMED", ...patch } as Parameters<typeof insights.reviewFlag>[0];
    await expect(insights.reviewFlag(input)).rejects.toMatchObject({ code });
    expect(h.db.flagReviews).toEqual([]);
    expect(h.db.auditLogs).toEqual([]);
  });

  it("only administrators can review", async () => {
    for (const id of [ID.personal, ID.agent, ID.merchant]) {
      h.signIn(id);
      await expect(insights.reviewFlag({ kind: "AGENT_FLAG", subjectUserId: ID.agent, code: "OFF_HOURS_ACTIVITY", decision: "DISMISSED" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(h.db.flagReviews).toEqual([]);
  });

  it("without the migration, decisions are refused instead of silently lost", async () => {
    const db = await flaggedDb();
    delete db.flagReviews;
    h = installHarness(db);
    h.signIn(ADMIN_ID);
    expect((await insights.agentIntelligence()).reviewsEnabled).toBe(false);
    await expect(insights.reviewFlag({ kind: "AGENT_FLAG", subjectUserId: ID.agent, code: "OFF_HOURS_ACTIVITY", decision: "CONFIRMED" })).rejects.toMatchObject({ code: "NOT_SUPPORTED" });
  });
});
