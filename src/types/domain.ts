/**
 * Domain types shared by the UI and the API layer.
 *
 * These mirror the API contract a real backend must implement (see
 * services/contracts.ts). They are *views*: what the server is allowed to
 * return to a client. Sensitive values (full NID numbers, other people's
 * phone numbers, password/PIN hashes) never appear here.
 */

import type { Lang } from "@/lib/i18n/core";

/** Integer amount in minor units (poisha). ৳1.00 === 100. Never floats. */
export type Money = number;

export const ROLES = ["PERSONAL", "AGENT", "MERCHANT", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export type PersonalStatus = "PENDING_VERIFICATION" | "VERIFIED" | "SUSPENDED";
export type AgentStatus =
  | "APPLICATION_SUBMITTED"
  | "UNDER_REVIEW"
  | "VERIFIED"
  | "REJECTED"
  | "SUSPENDED";
export type MerchantStatus = "PENDING" | "UNDER_REVIEW" | "VERIFIED" | "REJECTED" | "SUSPENDED";
export type AdminStatus = "ACTIVE" | "SUSPENDED";
export type AccountStatus = PersonalStatus | AgentStatus | MerchantStatus | AdminStatus;

export interface CurrentUser {
  id: string;
  role: Role;
  name: string;
  /** The user's own phone — unmasked because it is their own data. */
  phone: string;
  email: string | null;
  status: AccountStatus;
  twoFactorEnabled: boolean;
  /** Saved interface language; null when the account has no saved preference. */
  language: Lang | null;
  /** Development/demo account flag — rendered as a visible badge. */
  isDemo: boolean;
  createdAt: string;
  agentCode?: string;
  outletName?: string;
  merchantId?: string;
  businessName?: string;
}

export interface SessionInfo {
  sessionId: string;
  expiresAt: string;
  user: CurrentUser;
}

/* ───────────────────────── Verification ───────────────────────── */

export type DocumentType =
  | "NID_FRONT"
  | "NID_BACK"
  | "PHOTO"
  | "SELFIE"
  | "TRADE_LICENSE"
  | "BUSINESS_REGISTRATION"
  | "TAX_CERTIFICATE"
  | "OWNER_NID"
  | "OTHER";

export type DocumentStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface VerificationDocument {
  id: string;
  type: DocumentType;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  uploadedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
}

/** Returned by the upload endpoint; referenced by id when registering. */
export interface UploadedFileRef {
  uploadId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface StatusEvent {
  status: AccountStatus;
  at: string;
  note: string | null;
}

export type SelfieStatus = "NOT_SUBMITTED" | "PENDING" | "VERIFIED" | "FAILED";

export type BusinessCategory =
  | "RESTAURANT"
  | "GROCERY"
  | "RETAIL"
  | "ECOMMERCE"
  | "PHARMACY"
  | "SERVICES"
  | "OTHER";

export interface MerchantBusinessView {
  merchantId: string;
  businessName: string;
  ownerName: string;
  category: BusinessCategory;
  businessAddress: string;
  registrationNumber: string;
  tradeLicenseNumber: string;
  taxId: string | null;
  settlementAccount: string;
}

export interface AgentDetailsView {
  agentCode: string;
  outletName: string;
  businessAddress: string;
  emergencyContact: { name: string; relation: string; phone: string };
}

export interface ProfileView {
  user: CurrentUser;
  dateOfBirth: string | null;
  address: string | null;
  nidMasked: string | null;
  selfieStatus: SelfieStatus | null;
  documents: VerificationDocument[];
  timeline: StatusEvent[];
  reviewNote: string | null;
  agent: AgentDetailsView | null;
  merchant: MerchantBusinessView | null;
}

/* ───────────────────────── Wallet & ledger ───────────────────────── */

export interface WalletView {
  currency: "BDT";
  /** Spendable e-money. For agents this is the e-money float. */
  available: Money;
  /** Personal savings pot. 0 for other roles. */
  savings: Money;
  /** Personal: incoming funds still clearing. Agent/Merchant: settlement in process. */
  pending: Money;
  /** Agents only: physical cash recorded at the outlet. */
  cashInHand: Money | null;
  updatedAt: string;
}

export const TRANSACTION_TYPES = [
  "SEND_MONEY",
  "RECEIVE_MONEY",
  "CASH_IN",
  "CASH_OUT",
  "MOBILE_RECHARGE",
  "MERCHANT_PAYMENT",
  "BILL_PAYMENT",
  "ADD_MONEY",
  "REFUND",
  "COMMISSION",
  "SETTLEMENT",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_STATUSES = [
  "PENDING",
  "SUCCESSFUL",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export type PaymentMethod = "QR_SCAN" | "MERCHANT_ID" | "PAYMENT_LINK" | "ONLINE_CHECKOUT";

export type PartyKind =
  | "PERSONAL"
  | "AGENT"
  | "MERCHANT"
  | "BILLER"
  | "OPERATOR"
  | "BANK"
  | "SYSTEM"
  | "EXTERNAL";

export interface PartyView {
  name: string;
  /** Masked unless it is the viewer's own account. */
  account: string;
  kind: PartyKind;
}

/** A transaction as seen by one viewer (type and direction are viewer-relative). */
export interface TransactionView {
  id: string;
  trxId: string;
  type: TransactionType;
  status: TransactionStatus;
  direction: "IN" | "OUT";
  amount: Money;
  /** Fee borne by the viewer on this transaction. */
  fee: Money;
  /** Commission earned by the viewer (agents). */
  commission: Money;
  /** Net effect on the viewer's wallet (amount ± fee). */
  total: Money;
  counterparty: PartyView;
  sender: PartyView;
  receiver: PartyView;
  description: string;
  reference: string | null;
  paymentMethod: PaymentMethod | null;
  relatedTrxId: string | null;
  refundedAmount: Money;
  createdAt: string;
  canDispute: boolean;
  canRefund: boolean;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface TransactionQuery {
  search?: string;
  type?: TransactionType | "ALL";
  status?: TransactionStatus | "ALL";
  /** ISO date (inclusive) */
  from?: string;
  /** ISO date (inclusive) */
  to?: string;
  page?: number;
  pageSize?: number;
}

/* ───────────────────────── Operations (money movement) ───────────────────────── */

export type Operator = "GRAMEENPHONE" | "ROBI" | "BANGLALINK" | "TELETALK" | "AIRTEL";
export type ConnectionType = "PREPAID" | "POSTPAID";

export type OperationRequest =
  | { kind: "SEND_MONEY"; to: string; amount: Money; reference?: string }
  | { kind: "CASH_OUT"; agentNumber: string; amount: Money }
  | {
      kind: "MOBILE_RECHARGE";
      operator: Operator;
      number: string;
      connection: ConnectionType;
      amount: Money;
    }
  | { kind: "BILL_PAYMENT"; billerId: string; accountNumber: string; amount: Money }
  | {
      kind: "MERCHANT_PAYMENT";
      merchantId: string;
      amount: Money;
      paymentCode?: string;
      reference?: string;
    }
  /** `walletNumber` is required when the source is a mobile wallet (bKash, Nagad, …). */
  | { kind: "ADD_MONEY"; sourceId: string; amount: Money; walletNumber?: string }
  | { kind: "AGENT_CASH_IN"; customer: string; amount: Money }
  | { kind: "AGENT_CASH_OUT"; customer: string; amount: Money }
  | { kind: "AGENT_RECHARGE"; operator: Operator; number: string; amount: Money }
  | {
      kind: "AGENT_CUSTOMER_PAYMENT";
      billerId: string;
      accountNumber: string;
      customerPhone: string;
      amount: Money;
    }
  | { kind: "MERCHANT_REFUND"; trxId: string; amount: Money; reason: string }
  | { kind: "SETTLEMENT"; direction: "TO_BANK" | "FLOAT_TOP_UP"; amount: Money };

export type OperationKind = OperationRequest["kind"];

export interface SummaryRow {
  label: string;
  value: string;
  emphasis?: boolean;
}

/** Server-computed preview. The client never computes fees or totals. */
export interface OperationQuote {
  kind: OperationKind;
  amount: Money;
  fee: Money;
  commission: Money;
  total: Money;
  balanceAfter: Money;
  counterparty: PartyView;
  requiresOtp: boolean;
  /** Who receives the OTP: the signed-in user, or the customer (agent-assisted cash out). */
  otpTarget: "SELF" | "CUSTOMER" | null;
  /** Masked number the code will be sent to. */
  otpDestination: string | null;
  otpReason: string | null;
  summary: SummaryRow[];
  warnings: string[];
}

export interface OperationAuth {
  pin: string;
  otp?: { challengeId: string; code: string };
  /** Client-generated; lets the server drop accidental double submits. */
  idempotencyKey: string;
}

export interface OperationResult {
  transaction: TransactionView;
  balanceAfter: Money;
}

/* ───────────────────────── OTP ───────────────────────── */

export type OtpPurpose =
  | "REGISTRATION"
  | "LOGIN"
  | "PASSWORD_RESET"
  | "TRANSACTION"
  | "CUSTOMER_CASH_OUT"
  | "CHANGE_PIN"
  | "ENABLE_2FA";

export interface OtpChallenge {
  challengeId: string;
  destinationMasked: string;
  expiresAt: string;
  resendAvailableAt: string;
  /**
   * Only populated by the development (mock) SMS provider so the flow can be
   * tested without a phone. A real provider never returns the code.
   */
  devCode?: string;
}

/* ───────────────────────── Notifications ───────────────────────── */

export type NotificationType =
  | "PAYMENT_SUCCESS"
  | "PAYMENT_FAILED"
  | "MONEY_RECEIVED"
  | "MONEY_SENT"
  | "ACCOUNT_VERIFICATION"
  | "SECURITY_ALERT"
  | "MERCHANT_PAYMENT"
  | "AGENT_SETTLEMENT"
  | "SYSTEM_ANNOUNCEMENT";

export interface NotificationView {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  link: string | null;
}

/* ───────────────────────── Security ───────────────────────── */

export interface SessionView {
  id: string;
  device: string;
  location: string;
  ipMasked: string;
  createdAt: string;
  lastActiveAt: string;
  current: boolean;
}

export interface LoginEvent {
  id: string;
  success: boolean;
  method: "PASSWORD" | "PASSWORD_OTP";
  device: string;
  location: string;
  ipMasked: string;
  reason: string | null;
  createdAt: string;
}

/* ───────────────────────── Dashboards (server-aggregated) ───────────────────────── */

export interface PersonalDashboard {
  wallet: WalletView;
  month: {
    income: Money;
    spending: Money;
    savings: Money;
    transactionCount: number;
    sent: Money;
    received: Money;
    spent: Money;
    saved: Money;
  };
  previousMonth: { sent: Money; received: Money; spent: Money; saved: Money };
  monthly: { month: string; income: Money; spending: Money; savings: Money; count: number }[];
  spendingByCategory: { category: string; amount: Money }[];
  recent: TransactionView[];
  limits: { perTransaction: Money; dailyOut: Money; usedToday: Money };
}

export interface AgentDashboard {
  wallet: WalletView;
  status: AgentStatus;
  month: {
    cashIn: Money;
    cashOut: Money;
    recharge: Money;
    transactionCount: number;
    commission: Money;
  };
  today: { cashIn: Money; cashOut: Money; recharge: Money; commission: Money; count: number };
  daily: { date: string; cashIn: Money; cashOut: Money }[];
  monthly: { month: string; volume: Money; count: number; commission: Money }[];
}

export interface MerchantDashboard {
  wallet: WalletView;
  status: MerchantStatus;
  business: MerchantBusinessView;
  today: {
    revenue: Money;
    orders: number;
    successful: number;
    failed: number;
    refunds: Money;
  };
  month: { revenue: Money; expenses: Money; net: Money; count: number };
  pendingPayments: Money;
  daily: { date: string; sales: Money; count: number }[];
  weekly: { week: string; sales: Money; count: number }[];
  monthly: { month: string; revenue: Money; refunds: Money; count: number }[];
  paymentMethods: { method: PaymentMethod; amount: Money; count: number }[];
  recent: TransactionView[];
}

export interface CommissionSummary {
  today: Money;
  week: Money;
  month: Money;
  allTime: Money;
  byType: { type: string; amount: Money; count: number }[];
  daily: { date: string; amount: Money }[];
  monthly: { month: string; amount: Money }[];
  recent: { id: string; trxId: string; type: string; base: Money; amount: Money; createdAt: string }[];
}

export interface SettlementView {
  id: string;
  trxId: string;
  direction: "TO_BANK" | "FLOAT_TOP_UP";
  amount: Money;
  status: TransactionStatus;
  destination: string;
  createdAt: string;
  completedAt: string | null;
}

export interface FundingSource {
  id: string;
  /** MFS = an external mobile wallet (bKash, Nagad, Rocket, Upay), verified per transfer with a one-time code. */
  kind: "BANK" | "CARD" | "MFS";
  label: string;
  masked: string;
}

/* ───────────────────────── Merchant QR ───────────────────────── */

export type PaymentRequestStatus = "AWAITING" | "PAID" | "EXPIRED" | "CANCELLED";

export interface PaymentRequestView {
  id: string;
  amount: Money;
  note: string | null;
  status: PaymentRequestStatus;
  qrPayload: string;
  createdAt: string;
  expiresAt: string;
  paidAt: string | null;
  trxId: string | null;
  payer: PartyView | null;
}

export interface MerchantQrView {
  merchantId: string;
  businessName: string;
  category: BusinessCategory;
  qrPayload: string;
  enabled: boolean;
}

/* ───────────────────────── Lookups ───────────────────────── */

export interface Biller {
  id: string;
  name: string;
  category: "ELECTRICITY" | "GAS" | "WATER" | "INTERNET" | "TV" | "EDUCATION";
  accountLabel: string;
}

export interface BillDetails {
  billerId: string;
  accountNumber: string;
  customerName: string;
  amountDue: Money;
  dueDate: string;
  period: string;
}

/* ───────────────────────── Disputes & admin ───────────────────────── */

export type DisputeStatus = "OPEN" | "INVESTIGATING" | "RESOLVED" | "REJECTED";

export interface DisputeView {
  id: string;
  trxId: string;
  raisedBy: { id: string; name: string; role: Role };
  reason: string;
  status: DisputeStatus;
  amount: Money;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminStats {
  users: { total: number; personal: number; agents: number; merchants: number; suspended: number };
  pendingVerifications: { agents: number; merchants: number };
  today: { volume: Money; count: number; failed: number; fees: Money };
  month: { volume: Money; count: number };
  openDisputes: number;
  daily: { date: string; volume: Money; count: number }[];
  byType: { type: TransactionType; volume: Money; count: number }[];
}

export interface AdminUserRow {
  id: string;
  name: string;
  role: Role;
  phoneMasked: string;
  email: string | null;
  status: AccountStatus;
  createdAt: string;
  lastLoginAt: string | null;
  businessName: string | null;
  isDemo: boolean;
}

export interface AdminUserDetail extends AdminUserRow {
  profile: ProfileView;
  wallet: WalletView | null;
  transactionCount: number;
}

export interface VerificationApplication {
  userId: string;
  role: "AGENT" | "MERCHANT";
  applicantName: string;
  businessName: string | null;
  phoneMasked: string;
  status: AgentStatus | MerchantStatus;
  submittedAt: string;
  documents: VerificationDocument[];
  details: { label: string; value: string }[];
  timeline: StatusEvent[];
  reviewNote: string | null;
}

export type VerificationDecision = "START_REVIEW" | "APPROVE" | "REJECT";

export interface AuditLogEntry {
  id: string;
  action: string;
  actor: { id: string | null; name: string; role: Role | "SYSTEM" | "ANONYMOUS" };
  target: string | null;
  ipMasked: string;
  createdAt: string;
  metadata: Record<string, string | number | boolean | null>;
}

export interface AuditQuery {
  search?: string;
  action?: string;
  page?: number;
  pageSize?: number;
}

export interface UserQuery {
  role?: Role | "ALL";
  status?: AccountStatus | "ALL";
  search?: string;
  page?: number;
  pageSize?: number;
}
