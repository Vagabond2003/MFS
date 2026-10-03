import type {
  AdminStats,
  AdminUserDetail,
  AdminUserRow,
  AgentDashboard,
  AuditLogEntry,
  AuditQuery,
  BillDetails,
  Biller,
  CommissionSummary,
  DisputeStatus,
  DisputeView,
  FundingSource,
  LoginEvent,
  MerchantDashboard,
  MerchantQrView,
  NotificationView,
  OperationAuth,
  OperationQuote,
  OperationRequest,
  OperationResult,
  OtpChallenge,
  Paginated,
  PaymentRequestView,
  PersonalDashboard,
  ProfileView,
  SessionInfo,
  SessionView,
  SettlementView,
  TransactionQuery,
  TransactionView,
  UploadedFileRef,
  UserQuery,
  VerificationApplication,
  VerificationDecision,
  WalletView,
} from "@/types/domain";
import type {
  AgentRegistrationInput,
  MerchantRegistrationInput,
  PersonalRegistrationInput,
} from "@/lib/validation";

/**
 * The API contract. The UI depends ONLY on this interface.
 *
 * Two implementations exist:
 *   - services/http  — REST client for a real backend (see README "API contract")
 *   - services/mock  — in-browser development server with seeded demo data
 *
 * Every method is authorised server-side from the session: the client never
 * sends its own role, balance, fee or user id.
 */

export interface LoginInput {
  /** Mobile number (01XXXXXXXXX) or email */
  identifier: string;
  password: string;
  remember: boolean;
}

export type LoginResult =
  | { status: "AUTHENTICATED"; session: SessionInfo }
  | { status: "OTP_REQUIRED"; challenge: OtpChallenge };

export interface AuthApi {
  login(input: LoginInput): Promise<LoginResult>;
  verifyLoginOtp(challengeId: string, code: string, remember: boolean): Promise<SessionInfo>;
  resendLoginOtp(challengeId: string): Promise<OtpChallenge>;
  /** Resolve the current session from the cookie (null if signed out). */
  me(): Promise<SessionInfo | null>;
  logout(): Promise<void>;
  requestPasswordReset(identifier: string): Promise<OtpChallenge>;
  resetPassword(input: { challengeId: string; code: string; newPassword: string }): Promise<void>;
}

export interface RegistrationApi {
  sendPhoneOtp(phone: string): Promise<OtpChallenge>;
  registerPersonal(input: PersonalRegistrationInput): Promise<{ userId: string }>;
  registerAgent(input: AgentRegistrationInput): Promise<{ userId: string; applicationId: string }>;
  registerMerchant(input: MerchantRegistrationInput): Promise<{ userId: string; merchantId: string }>;
  /** Development KYC provider: starts a liveness/selfie check. */
  startSelfieCheck(): Promise<{ checkId: string; status: "PENDING" | "VERIFIED" | "FAILED" }>;
}

export type UploadPurpose = "NID" | "PHOTO" | "SELFIE" | "BUSINESS_DOCUMENT";

export interface UploadApi {
  upload(file: File, purpose: UploadPurpose): Promise<UploadedFileRef>;
}

export interface WalletApi {
  get(): Promise<WalletView>;
  fundingSources(): Promise<FundingSource[]>;
}

export interface OperationsApi {
  /** Server validates permissions, counterparty, limits and computes fees. */
  quote(request: OperationRequest): Promise<OperationQuote>;
  /** Sends the step-up OTP required by a quote (to self or the customer). */
  requestOtp(request: OperationRequest): Promise<OtpChallenge>;
  /** Re-validates everything, verifies PIN/OTP and posts atomically. */
  execute(request: OperationRequest, auth: OperationAuth): Promise<OperationResult>;
}

export interface TransactionsApi {
  list(query: TransactionQuery): Promise<Paginated<TransactionView>>;
  get(trxId: string): Promise<TransactionView>;
  raiseDispute(trxId: string, reason: string): Promise<DisputeView>;
}

export interface NotificationsApi {
  list(query: { unreadOnly?: boolean; page?: number; pageSize?: number }): Promise<Paginated<NotificationView>>;
  unreadCount(): Promise<number>;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;
}

export interface ProfileApi {
  get(): Promise<ProfileView>;
  update(input: { email?: string | null; address?: string }): Promise<ProfileView>;
}

export interface SecurityApi {
  changePassword(input: { currentPassword: string; newPassword: string }): Promise<void>;
  requestPinChangeOtp(): Promise<OtpChallenge>;
  changePin(input: { currentPin: string; newPin: string; challengeId: string; code: string }): Promise<void>;
  requestTwoFactorOtp(): Promise<OtpChallenge>;
  setTwoFactor(input: { enabled: boolean; challengeId?: string; code?: string; password: string }): Promise<void>;
  sessions(): Promise<SessionView[]>;
  revokeSession(sessionId: string): Promise<void>;
  /** Revokes every session including the current one. */
  logoutAll(): Promise<void>;
  loginHistory(): Promise<LoginEvent[]>;
}

export interface PersonalApi {
  dashboard(): Promise<PersonalDashboard>;
  recentRecipients(): Promise<{ name: string; phone: string }[]>;
}

export interface AgentApi {
  dashboard(): Promise<AgentDashboard>;
  commissions(): Promise<CommissionSummary>;
  settlements(): Promise<SettlementView[]>;
}

export interface MerchantApi {
  dashboard(): Promise<MerchantDashboard>;
  qr(): Promise<MerchantQrView>;
  createPaymentRequest(input: { amount: number; note?: string }): Promise<PaymentRequestView>;
  getPaymentRequest(id: string): Promise<PaymentRequestView>;
  listPaymentRequests(): Promise<PaymentRequestView[]>;
  cancelPaymentRequest(id: string): Promise<PaymentRequestView>;
  /**
   * DEVELOPMENT ONLY — the mock QR provider simulates a customer scanning the
   * code and paying. The HTTP client throws NOT_SUPPORTED.
   */
  simulateQrPayment(id: string): Promise<PaymentRequestView>;
  settlements(): Promise<SettlementView[]>;
}

export interface LookupApi {
  billers(): Promise<Biller[]>;
  fetchBill(billerId: string, accountNumber: string): Promise<BillDetails>;
  /** Resolves a merchant from an ID or scanned QR payload (public business info only). */
  resolveMerchant(input: string): Promise<{ merchantId: string; businessName: string; paymentCode: string | null; amount: number | null }>;
}

export interface AdminApi {
  stats(): Promise<AdminStats>;
  users(query: UserQuery): Promise<Paginated<AdminUserRow>>;
  user(id: string): Promise<AdminUserDetail>;
  setUserStatus(id: string, action: "SUSPEND" | "REACTIVATE", reason: string): Promise<void>;
  verificationQueue(query: { role?: "AGENT" | "MERCHANT" | "ALL"; status?: string }): Promise<VerificationApplication[]>;
  decideVerification(userId: string, decision: VerificationDecision, note: string): Promise<VerificationApplication>;
  reviewDocument(documentId: string, status: "APPROVED" | "REJECTED", note: string): Promise<void>;
  transactions(query: TransactionQuery): Promise<Paginated<TransactionView>>;
  disputes(query: { status?: DisputeStatus | "ALL" }): Promise<DisputeView[]>;
  updateDispute(id: string, status: DisputeStatus, resolution: string): Promise<DisputeView>;
  auditLogs(query: AuditQuery): Promise<Paginated<AuditLogEntry>>;
}

export interface DevToolsApi {
  /** Mock-only: wipes the in-browser database and re-seeds demo data. */
  resetDemoData(): Promise<void>;
}

export interface ApiClient {
  /** supabase = this app's server + database · http = external backend */
  mode: "supabase" | "http";
  auth: AuthApi;
  registration: RegistrationApi;
  uploads: UploadApi;
  wallet: WalletApi;
  operations: OperationsApi;
  transactions: TransactionsApi;
  notifications: NotificationsApi;
  profile: ProfileApi;
  security: SecurityApi;
  personal: PersonalApi;
  agent: AgentApi;
  merchant: MerchantApi;
  lookup: LookupApi;
  admin: AdminApi;
  dev: DevToolsApi;
}
