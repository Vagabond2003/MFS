import type { OperationKind, Role } from "@/types/domain";

/**
 * Server-side business policy: who may do what, fees, commissions and limits.
 * All amounts are integer poisha. None of this is ever computed in the UI —
 * the UI only displays what a quote returns.
 */

const T = (taka: number) => taka * 100;

export interface OperationPolicy {
  label: string;
  roles: readonly Role[];
  /** Agent/Merchant must be VERIFIED; personal accounts may transact while KYC is pending (with lower limits). */
  requiresVerified: boolean;
  min: number;
  max: number;
}

export const OPERATION_POLICY: Record<OperationKind, OperationPolicy> = {
  SEND_MONEY: { label: "Send Money", roles: ["PERSONAL"], requiresVerified: false, min: T(10), max: T(25_000) },
  CASH_OUT: { label: "Cash Out", roles: ["PERSONAL"], requiresVerified: false, min: T(50), max: T(25_000) },
  MOBILE_RECHARGE: { label: "Mobile Recharge", roles: ["PERSONAL"], requiresVerified: false, min: T(20), max: T(1_000) },
  BILL_PAYMENT: { label: "Bill Payment", roles: ["PERSONAL"], requiresVerified: false, min: T(10), max: T(50_000) },
  MERCHANT_PAYMENT: { label: "Merchant Payment", roles: ["PERSONAL"], requiresVerified: false, min: T(1), max: T(50_000) },
  ADD_MONEY: { label: "Add Money", roles: ["PERSONAL"], requiresVerified: false, min: T(100), max: T(50_000) },
  AGENT_CASH_IN: { label: "Cash In", roles: ["AGENT"], requiresVerified: true, min: T(50), max: T(30_000) },
  AGENT_CASH_OUT: { label: "Cash Out", roles: ["AGENT"], requiresVerified: true, min: T(50), max: T(25_000) },
  AGENT_RECHARGE: { label: "Mobile Recharge", roles: ["AGENT"], requiresVerified: true, min: T(20), max: T(1_000) },
  AGENT_CUSTOMER_PAYMENT: { label: "Customer Payment", roles: ["AGENT"], requiresVerified: true, min: T(10), max: T(50_000) },
  MERCHANT_REFUND: { label: "Refund", roles: ["MERCHANT"], requiresVerified: true, min: T(1), max: T(50_000) },
  SETTLEMENT: { label: "Settlement", roles: ["AGENT", "MERCHANT"], requiresVerified: true, min: T(500), max: T(1_000_000) },
};

export const RATES = {
  sendMoneyFlat: T(5),
  sendMoneyFreeUpTo: T(1_000),
  cashOutFee: 0.0185,
  cashOutAgentCommission: 0.004,
  cashInAgentCommission: 0.002,
  rechargeAgentCommission: 0.025,
  billPaymentFlat: T(5),
  customerPaymentCommission: 0.005,
  customerPaymentCommissionMin: T(2),
  customerPaymentCommissionMax: T(20),
  merchantDiscountRate: 0.015,
};

export interface FeeBreakdown {
  senderFee: number;
  receiverFee: number;
  commission: number;
}

export function computeFees(kind: OperationKind, amount: number): FeeBreakdown {
  const pct = (rate: number) => Math.round(amount * rate);
  switch (kind) {
    case "SEND_MONEY":
      return { senderFee: amount > RATES.sendMoneyFreeUpTo ? RATES.sendMoneyFlat : 0, receiverFee: 0, commission: 0 };
    case "CASH_OUT":
    case "AGENT_CASH_OUT":
      return { senderFee: pct(RATES.cashOutFee), receiverFee: 0, commission: pct(RATES.cashOutAgentCommission) };
    case "AGENT_CASH_IN":
      return { senderFee: 0, receiverFee: 0, commission: pct(RATES.cashInAgentCommission) };
    case "AGENT_RECHARGE":
      return { senderFee: 0, receiverFee: 0, commission: pct(RATES.rechargeAgentCommission) };
    case "BILL_PAYMENT":
      return { senderFee: RATES.billPaymentFlat, receiverFee: 0, commission: 0 };
    case "AGENT_CUSTOMER_PAYMENT": {
      const c = Math.min(
        RATES.customerPaymentCommissionMax,
        Math.max(RATES.customerPaymentCommissionMin, pct(RATES.customerPaymentCommission)),
      );
      return { senderFee: 0, receiverFee: 0, commission: c };
    }
    case "MERCHANT_PAYMENT":
      return { senderFee: 0, receiverFee: pct(RATES.merchantDiscountRate), commission: 0 };
    default:
      return { senderFee: 0, receiverFee: 0, commission: 0 };
  }
}

/** Personal limits depend on KYC status. */
export const PERSONAL_LIMITS = {
  VERIFIED: { perTransaction: T(25_000), dailyOut: T(50_000) },
  PENDING_VERIFICATION: { perTransaction: T(5_000), dailyOut: T(10_000) },
} as const;

/** Step-up authentication: OTP in addition to PIN at or above this amount. */
export const OTP_STEP_UP_THRESHOLD = T(10_000);

export const SECURITY = {
  loginMaxAttempts: 5,
  loginLockMinutes: 15,
  pinMaxAttempts: 3,
  pinLockMinutes: 15,
  otpTtlSeconds: 180,
  otpResendSeconds: 30,
  otpMaxAttempts: 5,
  otpSendPerWindow: 5,
  otpSendWindowMinutes: 10,
  sessionHours: 12,
  rememberDays: 30,
  paymentRequestMinutes: 10,
  disputeWindowDays: 30,
  refundWindowDays: 30,
};
