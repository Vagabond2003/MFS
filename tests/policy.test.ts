import { describe, expect, it } from "vitest";
import type { OperationKind } from "@/types/domain";
import { OPERATION_POLICY, OTP_STEP_UP_THRESHOLD, PERSONAL_LIMITS, computeFees } from "@/services/mock/policy";
import { T } from "./helpers/harness";

const KINDS = Object.keys(OPERATION_POLICY) as OperationKind[];

describe("computeFees", () => {
  it("returns whole, non-negative poisha for every kind and amount", () => {
    for (const kind of KINDS) {
      const { min, max } = OPERATION_POLICY[kind];
      for (const amount of [min, min + 1, 12_345, 99_999, 1_234_567, max - 1, max]) {
        const fees = computeFees(kind, amount);
        for (const v of Object.values(fees)) {
          expect(Number.isInteger(v), `${kind} ${amount}`).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("Send Money is free up to ৳1,000 and ৳5 above", () => {
    expect(computeFees("SEND_MONEY", T(1_000)).senderFee).toBe(0);
    expect(computeFees("SEND_MONEY", T(1_000) + 1).senderFee).toBe(T(5));
    expect(computeFees("SEND_MONEY", T(25_000)).senderFee).toBe(T(5));
  });

  it("Cash Out: 1.85% charged to the customer, 0.4% commission to the agent, rounded to the poisha", () => {
    expect(computeFees("CASH_OUT", T(1_000))).toEqual({ senderFee: T(18.5), receiverFee: 0, commission: T(4) });
    expect(computeFees("AGENT_CASH_OUT", T(1_000))).toEqual(computeFees("CASH_OUT", T(1_000)));
    // 5,027 poisha × 1.85% = 92.9995 → 93; × 0.4% = 20.108 → 20
    expect(computeFees("CASH_OUT", 5_027)).toEqual({ senderFee: 93, receiverFee: 0, commission: 20 });
    // The largest cash-out a verified customer can make stays within the ৳25,000 per-transaction limit.
    expect(T(24_540) + computeFees("CASH_OUT", T(24_540)).senderFee).toBeLessThanOrEqual(PERSONAL_LIMITS.VERIFIED.perTransaction);
    expect(T(24_550) + computeFees("CASH_OUT", T(24_550)).senderFee).toBeGreaterThan(PERSONAL_LIMITS.VERIFIED.perTransaction);
  });

  it("agent bill payment commission is 0.5%, clamped to ৳2–৳20", () => {
    const commission = (taka: number) => computeFees("AGENT_CUSTOMER_PAYMENT", T(taka)).commission;
    expect(commission(10)).toBe(T(2)); // 0.05 → floor of ৳2
    expect(commission(399)).toBe(T(2)); // 1.995 → ৳2
    expect(commission(400)).toBe(T(2)); // exactly ৳2
    expect(commission(401)).toBe(T(2.01));
    expect(commission(4_000)).toBe(T(20)); // exactly ৳20
    expect(commission(4_001)).toBe(T(20)); // capped
    expect(commission(50_000)).toBe(T(20));
  });

  it("other fees and commissions", () => {
    expect(computeFees("MERCHANT_PAYMENT", T(1_000))).toEqual({ senderFee: T(15), receiverFee: 0, commission: 0 });
    expect(computeFees("BILL_PAYMENT", T(1_000))).toEqual({ senderFee: T(5), receiverFee: 0, commission: 0 });
    expect(computeFees("AGENT_CASH_IN", T(1_000))).toEqual({ senderFee: 0, receiverFee: 0, commission: T(2) });
    expect(computeFees("AGENT_RECHARGE", T(100))).toEqual({ senderFee: 0, receiverFee: 0, commission: T(2.5) });
    for (const kind of ["MOBILE_RECHARGE", "ADD_MONEY", "MERCHANT_REFUND", "SETTLEMENT"] as const) {
      expect(computeFees(kind, T(1_000))).toEqual({ senderFee: 0, receiverFee: 0, commission: 0 });
    }
  });
});

describe("operation policy", () => {
  it("each operation belongs to the roles that can perform it", () => {
    const byRole = (role: string) => KINDS.filter((k) => (OPERATION_POLICY[k].roles as readonly string[]).includes(role)).sort();
    expect(byRole("PERSONAL")).toEqual(["ADD_MONEY", "BILL_PAYMENT", "CASH_OUT", "MERCHANT_PAYMENT", "MOBILE_RECHARGE", "SEND_MONEY"]);
    expect(byRole("AGENT")).toEqual(["AGENT_CASH_IN", "AGENT_CASH_OUT", "AGENT_CUSTOMER_PAYMENT", "AGENT_RECHARGE", "SETTLEMENT"]);
    expect(byRole("MERCHANT")).toEqual(["MERCHANT_REFUND", "SETTLEMENT"]);
    expect(byRole("ADMIN")).toEqual([]);
  });

  it("limits are whole poisha and consistent", () => {
    for (const kind of KINDS) {
      const { min, max } = OPERATION_POLICY[kind];
      expect(Number.isInteger(min) && Number.isInteger(max) && 0 < min && min < max).toBe(true);
    }
    expect(PERSONAL_LIMITS.PENDING_VERIFICATION.perTransaction).toBeLessThan(PERSONAL_LIMITS.VERIFIED.perTransaction);
    expect(PERSONAL_LIMITS.PENDING_VERIFICATION.dailyOut).toBeLessThan(PERSONAL_LIMITS.VERIFIED.dailyOut);
    expect(OTP_STEP_UP_THRESHOLD).toBe(T(10_000));
  });
});
