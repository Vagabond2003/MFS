import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHURN_FEATURES } from "@/services/mock/intelligence/churn-features";
import { CHURN_MODEL, scoreChurnModel, type ChurnModelParams } from "@/services/mock/intelligence/churn-model";
import { churnRanking, merchantChurnRisk } from "@/services/mock/intelligence/churn";
import type { DbState, PartyRecord, TransactionRecord } from "@/services/mock/schema";
import { ID, T, fixtureDb } from "./helpers/harness";

/** Written by ml/train.py: test-set rows with Python's probabilities and per-feature contributions. */
const parity = JSON.parse(readFileSync("tests/fixtures/churn-parity.json", "utf8")) as {
  features: string[];
  rows: number[][];
  models: Record<string, ChurnModelParams>;
  predictions: Record<string, number[]>;
  contributions: Record<string, number[][]>;
  chosen: string;
};

describe("TypeScript scorer matches Python", () => {
  it("uses the app's feature order", () => {
    expect(parity.features).toEqual([...CHURN_FEATURES]);
  });

  it.each(Object.keys(parity.models))("%s: same probabilities and reasons on %s test rows", (name) => {
    const model = parity.models[name];
    let worstP = 0;
    let worstC = 0;
    parity.rows.forEach((x, i) => {
      const { probability, contributions } = scoreChurnModel(model, x);
      worstP = Math.max(worstP, Math.abs(probability - parity.predictions[name][i]));
      contributions.forEach((c, j) => (worstC = Math.max(worstC, Math.abs(c - parity.contributions[name][i][j]))));
    });
    expect(parity.rows.length).toBeGreaterThanOrEqual(100);
    expect(worstP).toBeLessThan(1e-9);
    expect(worstC).toBeLessThan(1e-9);
  });

  it("the model in the app is the one Python chose", () => {
    expect(CHURN_MODEL.kind).toBe(parity.chosen);
    parity.rows.slice(0, 50).forEach((x, i) => expect(scoreChurnModel(CHURN_MODEL, x).probability).toBeCloseTo(parity.predictions[parity.chosen][i], 12));
  });

  it("contributions add up to the prediction", () => {
    for (const model of Object.values(parity.models)) {
      const x = parity.rows[0];
      const { probability, contributions } = scoreChurnModel(model, x);
      const base = model.kind === "logistic_regression" ? model.intercept : model.init + model.learningRate * model.trees.reduce((s, t) => s + t.value[0], 0);
      const z = base + contributions.reduce((s, c) => s + c, 0);
      expect(1 / (1 + Math.exp(-z))).toBeCloseTo(probability, 12);
    }
  });
});

/* ───────────── In the app ───────────── */

const NOW = Date.parse("2026-10-07T06:00:00.000Z");
const DAY = 86_400_000;
const party = (userId: string, kind: PartyRecord["kind"]): PartyRecord => ({ userId, name: userId, account: userId, kind });
let seq = 0;
const payment = (at: number): TransactionRecord => {
  const createdAt = new Date(at).toISOString();
  return {
    id: `t${++seq}`, trxId: `TX${seq}`, type: "MERCHANT_PAYMENT", status: "SUCCESSFUL", amount: T(500), senderFee: 0, receiverFee: 0, commission: null,
    sender: party(ID.personal, "PERSONAL"), receiver: party(ID.merchant, "MERCHANT"), description: "x", reference: null, paymentMethod: null, relatedTrxId: null,
    refundedAmount: 0, pendingHold: null, pendingCredit: null, cashEffect: null, settleAt: null, failureReason: null, createdAt, completedAt: createdAt, settlementDirection: null,
  };
};
async function merchantWith(days: number[], createdDaysAgo = 400): Promise<DbState> {
  const db = await fixtureDb();
  db.users.find((u) => u.id === ID.merchant)!.createdAt = new Date(NOW - createdDaysAgo * DAY).toISOString();
  db.transactions.push(...days.map((d) => payment(NOW - d * DAY)));
  return db;
}

describe("churn scoring in the app", () => {
  it("a steady merchant is scored by the model as low risk", async () => {
    const db = await merchantWith(Array.from({ length: 80 }, (_, d) => d + 1));
    expect(merchantChurnRisk(db, ID.merchant, NOW)).toMatchObject({ method: "MODEL", level: "LOW" });
  });

  it("a merchant who stopped three weeks ago is HIGH, with recency as the main reason", async () => {
    const db = await merchantWith(Array.from({ length: 60 }, (_, d) => d + 21));
    const r = merchantChurnRisk(db, ID.merchant, NOW)!;
    expect(r).toMatchObject({ method: "MODEL", level: "HIGH" });
    expect(r.score).toBe(Math.round(r.probability! * 100));
    expect(r.factors[0].key).toBe("RECENCY");
    expect(r.factors[0].value).toBe(21);
  });

  it("reasons are only given when the value points to risk", async () => {
    const db = await merchantWith(Array.from({ length: 80 }, (_, d) => d + 1));
    const r = merchantChurnRisk(db, ID.merchant, NOW)!;
    for (const f of r.factors) {
      if (f.key === "RECENCY") expect(f.value).toBeGreaterThanOrEqual(3);
      if (f.key === "TREND") expect(f.value).toBeLessThan(0);
      if (f.key === "ACTIVITY") expect(f.value).toBeLessThan(0.5);
    }
  });

  it("falls back to the rule score for a new merchant (thin history)", async () => {
    const db = await merchantWith([1, 2, 3, 5, 8, 13], 20);
    expect(merchantChurnRisk(db, ID.merchant, NOW)).toMatchObject({ method: "RULES", probability: null });
  });

  it("falls back to the rule score with fewer than 5 payments in 60 days", async () => {
    const db = await merchantWith([2, 30, 50, 70, 90, 110]);
    expect(merchantChurnRisk(db, ID.merchant, NOW)).toMatchObject({ method: "RULES" });
  });

  it("ranks by level first, then score", async () => {
    const db = await merchantWith(Array.from({ length: 60 }, (_, d) => d + 21));
    const ranking = churnRanking(db, NOW);
    const ranks = ranking.map((r) => ({ HIGH: 2, MEDIUM: 1, LOW: 0 })[r.level]);
    expect(ranks).toEqual([...ranks].sort((a, b) => b - a));
  });
});
