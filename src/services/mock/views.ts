import { maskPhone, maskTail } from "@/lib/utils";
import type {
  CurrentUser,
  NotificationView,
  PartyView,
  ProfileView,
  TransactionType,
  TransactionView,
  VerificationDocument,
  WalletView,
} from "@/types/domain";
import { SECURITY } from "./policy";
import type {
  DbState,
  DocumentRecord,
  NotificationRecord,
  PartyRecord,
  TransactionRecord,
  UserRecord,
  WalletRecord,
} from "./schema";

/**
 * Record → view mappers. This is the boundary where sensitive data is
 * stripped: other people's phone numbers are masked, NIDs are masked,
 * hashes never leave, and transaction type/direction are made relative to
 * the viewer.
 */

export function toCurrentUser(db: DbState, u: UserRecord): CurrentUser {
  const agent = u.role === "AGENT" ? db.agentProfiles.find((p) => p.userId === u.id) : undefined;
  const biz = u.role === "MERCHANT" ? db.merchantBusinesses.find((b) => b.userId === u.id) : undefined;
  return {
    id: u.id,
    role: u.role,
    name: u.name,
    phone: u.phone,
    email: u.email,
    status: u.status,
    twoFactorEnabled: u.twoFactorEnabled,
    language: u.language ?? null,
    isDemo: u.isDemo,
    createdAt: u.createdAt,
    ...(agent ? { agentCode: agent.agentCode, outletName: agent.outletName } : {}),
    ...(biz ? { merchantId: biz.merchantId, businessName: biz.businessName } : {}),
  };
}

export function toWalletView(w: WalletRecord): WalletView {
  return {
    currency: "BDT",
    available: w.available,
    savings: w.savings,
    pending: w.pending,
    cashInHand: w.cashInHand,
    updatedAt: w.updatedAt,
  };
}

function maskAccount(p: PartyRecord, viewerId: string | null): string {
  if (viewerId && p.userId === viewerId) return p.account;
  switch (p.kind) {
    case "PERSONAL":
    case "AGENT":
    case "EXTERNAL":
    case "OPERATOR":
      return /^\d{11}$/.test(p.account) ? maskPhone(p.account) : p.account;
    case "MERCHANT":
    case "SYSTEM":
      return p.account; // merchant IDs are public
    case "BANK":
      return p.account.includes("•") ? p.account : maskTail(p.account);
    case "BILLER":
      return p.account.length > 4 ? maskTail(p.account) : p.account;
  }
}

function toParty(p: PartyRecord, viewerId: string | null): PartyView {
  return { name: p.name, account: maskAccount(p, viewerId), kind: p.kind };
}

const DISPUTABLE: TransactionRecord["type"][] = [
  "SEND_MONEY",
  "MERCHANT_PAYMENT",
  "BILL_PAYMENT",
  "MOBILE_RECHARGE",
  "CASH_OUT",
];

/**
 * @param viewerId the signed-in user, or null for an admin (neutral) view
 */
export function toTransactionView(
  db: DbState,
  t: TransactionRecord,
  viewerId: string | null,
): TransactionView {
  const isSender = viewerId !== null && t.sender.userId === viewerId;
  const isReceiver = viewerId !== null && t.receiver.userId === viewerId;
  const isCommissionOnly = viewerId !== null && !isSender && !isReceiver && t.commission?.userId === viewerId;

  let direction: "IN" | "OUT" = isReceiver && !isSender ? "IN" : "OUT";
  let type: TransactionType = t.type;
  if (t.type === "SEND_MONEY" && direction === "IN") type = "RECEIVE_MONEY";
  if (isCommissionOnly) {
    direction = "IN";
    type = "COMMISSION";
  }

  const fee = viewerId === null ? t.senderFee + t.receiverFee : isSender ? t.senderFee : isReceiver ? t.receiverFee : 0;
  const commission = viewerId !== null && t.commission?.userId === viewerId ? t.commission.amount : 0;
  const total = isCommissionOnly ? commission : direction === "OUT" ? t.amount + fee : t.amount - fee;
  const counterparty = direction === "OUT" ? t.receiver : t.sender;

  const ageDays = (Date.now() - Date.parse(t.createdAt)) / 86_400_000;
  const viewer = viewerId ? db.users.find((u) => u.id === viewerId) : null;
  const alreadyDisputed = db.disputes.some((d) => d.trxId === t.trxId);

  return {
    id: t.id,
    trxId: t.trxId,
    type,
    status: t.status,
    direction,
    amount: t.amount,
    fee,
    commission,
    total,
    counterparty: toParty(counterparty, viewerId),
    sender: toParty(t.sender, viewerId),
    receiver: toParty(t.receiver, viewerId),
    description: t.description,
    reference: t.reference,
    paymentMethod: t.paymentMethod,
    relatedTrxId: t.relatedTrxId,
    refundedAmount: t.refundedAmount,
    createdAt: t.createdAt,
    canDispute:
      viewer?.role === "PERSONAL" &&
      isSender &&
      DISPUTABLE.includes(t.type) &&
      (t.status === "SUCCESSFUL" || t.status === "FAILED") &&
      ageDays <= SECURITY.disputeWindowDays &&
      !alreadyDisputed,
    canRefund:
      viewer?.role === "MERCHANT" &&
      isReceiver &&
      t.type === "MERCHANT_PAYMENT" &&
      t.status === "SUCCESSFUL" &&
      t.refundedAmount < t.amount &&
      ageDays <= SECURITY.refundWindowDays,
  };
}

export function toDocumentView(d: DocumentRecord): VerificationDocument {
  return {
    id: d.id,
    type: d.type,
    fileName: d.fileName,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    status: d.status,
    uploadedAt: d.uploadedAt,
    reviewedAt: d.reviewedAt,
    reviewNote: d.reviewNote,
  };
}

export function maskNid(nid: string | null) {
  return nid ? maskTail(nid, 4) : null;
}

export function toProfileView(db: DbState, u: UserRecord): ProfileView {
  const personal = db.personalProfiles.find((p) => p.userId === u.id);
  const agent = db.agentProfiles.find((p) => p.userId === u.id);
  const merchant = db.merchantProfiles.find((p) => p.userId === u.id);
  const biz = db.merchantBusinesses.find((b) => b.userId === u.id);

  return {
    user: toCurrentUser(db, u),
    dateOfBirth: personal?.dateOfBirth ?? agent?.dateOfBirth ?? null,
    address: personal?.address ?? agent?.address ?? biz?.businessAddress ?? null,
    nidMasked: maskNid(personal?.nidNumber ?? agent?.nidNumber ?? merchant?.ownerNidNumber ?? null),
    selfieStatus: personal?.selfieStatus ?? null,
    documents: db.documents.filter((d) => d.userId === u.id).map(toDocumentView),
    timeline: db.statusHistory
      .filter((h) => h.userId === u.id)
      .sort((a, b) => a.at.localeCompare(b.at))
      .map((h) => ({ status: h.status, at: h.at, note: h.note })),
    reviewNote: agent?.reviewNote ?? merchant?.reviewNote ?? null,
    agent: agent
      ? {
          agentCode: agent.agentCode,
          outletName: agent.outletName,
          businessAddress: agent.businessAddress,
          emergencyContact: {
            name: agent.emergencyName,
            relation: agent.emergencyRelation,
            phone: maskPhone(agent.emergencyPhone),
          },
        }
      : null,
    merchant: biz
      ? {
          merchantId: biz.merchantId,
          businessName: biz.businessName,
          ownerName: merchant?.ownerName ?? u.name,
          category: biz.category,
          businessAddress: biz.businessAddress,
          registrationNumber: biz.registrationNumber,
          tradeLicenseNumber: biz.tradeLicenseNumber,
          taxId: biz.taxId,
          settlementAccount: biz.settlementAccount,
        }
      : null,
  };
}

export function toNotificationView(n: NotificationRecord): NotificationView {
  return { id: n.id, type: n.type, title: n.title, body: n.body, read: n.read, createdAt: n.createdAt, link: n.link };
}
