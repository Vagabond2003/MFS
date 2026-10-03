/**
 * Mock database "tables". These mirror the relational schema a real backend
 * would use (see README → Database design). Records here are server-side only:
 * they are mapped to the view types in types/domain.ts before reaching the UI.
 */
import type {
  AccountStatus,
  BusinessCategory,
  DisputeStatus,
  DocumentStatus,
  DocumentType,
  NotificationType,
  OtpPurpose,
  PartyKind,
  PaymentMethod,
  PaymentRequestStatus,
  Role,
  SelfieStatus,
  TransactionStatus,
  TransactionType,
} from "@/types/domain";
import type { Lang } from "@/lib/i18n/core";

export const DB_VERSION = 5;

/** users */
export interface UserRecord {
  id: string;
  role: Role;
  name: string;
  phone: string;
  email: string | null;
  /** PBKDF2-SHA256, never plaintext */
  passwordHash: string;
  /** PBKDF2-SHA256 transaction PIN */
  pinHash: string;
  status: AccountStatus;
  twoFactorEnabled: boolean;
  /** Interface language. Missing on databases that haven't run the language migration. */
  language?: Lang;
  /** Current profile picture (avatars.id); null shows initials. Missing before the profile-picture migration. */
  avatarId?: string | null;
  isDemo: boolean;
  failedLoginCount: number;
  lockedUntil: string | null;
  pinFailedCount: number;
  pinLockedUntil: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

/** personal_profiles */
export interface PersonalProfileRecord {
  userId: string;
  dateOfBirth: string;
  address: string;
  /** Encrypted at rest in a real database; only masked values leave the server. */
  nidNumber: string | null;
  selfieStatus: SelfieStatus;
}

/** agent_profiles */
export interface AgentProfileRecord {
  userId: string;
  agentCode: string;
  dateOfBirth: string;
  address: string;
  outletName: string;
  businessAddress: string;
  emergencyName: string;
  emergencyRelation: string;
  emergencyPhone: string;
  nidNumber: string;
  reviewNote: string | null;
  /** Where the outlet operates. Missing on databases without the intelligence migration. */
  district?: string | null;
  area?: string | null;
}

/** merchant_profiles (owner identity) */
export interface MerchantProfileRecord {
  userId: string;
  ownerName: string;
  ownerNidNumber: string;
  reviewNote: string | null;
}

/** merchant_businesses */
export interface MerchantBusinessRecord {
  id: string;
  userId: string;
  merchantId: string;
  businessName: string;
  category: BusinessCategory;
  businessAddress: string;
  registrationNumber: string;
  tradeLicenseNumber: string;
  taxId: string | null;
  settlementAccount: string;
  /** Where the business operates. Missing on databases without the intelligence migration. */
  district?: string | null;
  area?: string | null;
}

/** account_status_history */
export interface StatusHistoryRecord {
  id: string;
  userId: string;
  status: AccountStatus;
  note: string | null;
  actorId: string | null;
  at: string;
}

/** verification_documents */
export interface DocumentRecord {
  id: string;
  userId: string | null;
  type: DocumentType;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
  status: DocumentStatus;
  uploadedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  reviewedBy: string | null;
}

/** wallets */
export interface WalletRecord {
  id: string;
  userId: string;
  currency: "BDT";
  available: number;
  savings: number;
  pending: number;
  cashInHand: number | null;
  /** Optimistic-locking version, bumped on every balance change. */
  version: number;
  updatedAt: string;
}

/** transaction_parties (embedded for the mock) */
export interface PartyRecord {
  userId: string | null;
  name: string;
  account: string;
  kind: PartyKind;
}

export type CoreTransactionType = Exclude<TransactionType, "RECEIVE_MONEY">;

/** transactions */
export interface TransactionRecord {
  id: string;
  trxId: string;
  type: CoreTransactionType;
  status: TransactionStatus;
  amount: number;
  senderFee: number;
  receiverFee: number;
  commission: { userId: string; amount: number } | null;
  sender: PartyRecord;
  receiver: PartyRecord;
  description: string;
  reference: string | null;
  paymentMethod: PaymentMethod | null;
  relatedTrxId: string | null;
  refundedAmount: number;
  /** Funds held from a wallet while PENDING (e.g. settlement to bank). */
  pendingHold: { userId: string; amount: number } | null;
  /** Funds credited to a wallet's pending balance until the txn clears. */
  pendingCredit: { userId: string; amount: number } | null;
  /** Agent outlet physical-cash movement booked with this txn. */
  cashEffect: { userId: string; delta: number } | null;
  settleAt: string | null;
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
  settlementDirection: "TO_BANK" | "FLOAT_TOP_UP" | null;
}

/** commissions */
export interface CommissionRecord {
  id: string;
  agentId: string;
  trxId: string;
  type: CoreTransactionType;
  baseAmount: number;
  amount: number;
  createdAt: string;
}

/** notifications */
export interface NotificationRecord {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  link: string | null;
  createdAt: string;
}

/** otp_codes */
export interface OtpRecord {
  id: string;
  purpose: OtpPurpose;
  userId: string | null;
  destination: string;
  /** SHA-256(challengeId:code) — the code is never stored */
  codeHash: string;
  /** Binds the code to what it authorises (e.g. an operation fingerprint). */
  context: string;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  expiresAt: string;
  resendAvailableAt: string;
  verifiedAt: string | null;
  consumedAt: string | null;
}

/** sessions */
export interface SessionRecord {
  id: string;
  userId: string;
  device: string;
  location: string;
  ip: string;
  remember: boolean;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

/** audit_logs (append-only) */
export interface AuditLogRecord {
  id: string;
  actorId: string | null;
  actorRole: Role | "SYSTEM" | "ANONYMOUS";
  actorName: string;
  action: string;
  target: string | null;
  ip: string;
  createdAt: string;
  metadata: Record<string, string | number | boolean | null>;
}

/** disputes */
export interface DisputeRecord {
  id: string;
  trxId: string;
  userId: string;
  reason: string;
  status: DisputeStatus;
  resolution: string | null;
  amount: number;
  createdAt: string;
  updatedAt: string;
}

/** payment_requests (dynamic merchant QR) */
export interface PaymentRequestRecord {
  id: string;
  merchantUserId: string;
  amount: number;
  note: string | null;
  status: PaymentRequestStatus;
  createdAt: string;
  expiresAt: string;
  paidAt: string | null;
  trxId: string | null;
  payer: PartyRecord | null;
}

/** ai_insights — cached AI wording for computed insights (see src/server/ai). */
export interface AiInsightRecord {
  id: string;
  userId: string;
  kind: string;
  language: Lang;
  /** SHA-256 of the computed figures that were explained. */
  inputHash: string;
  payload: Record<string, unknown>;
  /** Model id, or "template" when no model answered. */
  model: string;
  createdAt: string;
}

export interface DbState {
  version: number;
  seededAt: string;
  users: UserRecord[];
  personalProfiles: PersonalProfileRecord[];
  agentProfiles: AgentProfileRecord[];
  merchantProfiles: MerchantProfileRecord[];
  merchantBusinesses: MerchantBusinessRecord[];
  statusHistory: StatusHistoryRecord[];
  documents: DocumentRecord[];
  wallets: WalletRecord[];
  transactions: TransactionRecord[];
  commissions: CommissionRecord[];
  notifications: NotificationRecord[];
  otpCodes: OtpRecord[];
  sessions: SessionRecord[];
  auditLogs: AuditLogRecord[];
  disputes: DisputeRecord[];
  paymentRequests: PaymentRequestRecord[];
  /** Empty on databases without the intelligence migration. */
  aiInsights: AiInsightRecord[];
  /** rate_limits: key → fixed-window counter */
  rateLimits: Record<string, { count: number; resetAt: number }>;
  /** idempotency_keys: key → resulting trxId */
  idempotency: Record<string, { trxId: string; userId: string; createdAt: string }>;
}
