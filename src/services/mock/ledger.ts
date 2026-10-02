import { ApiError } from "../errors";
import { newTrxId, randomId } from "./crypto";
import type {
  CoreTransactionType,
  DbState,
  PartyRecord,
  TransactionRecord,
  WalletRecord,
} from "./schema";
import type { PaymentMethod, TransactionStatus } from "@/types/domain";

/**
 * Double-entry-style posting. Every balance change in the system goes through
 * `post()` inside a `write()` transaction, so the debit, credit, fee,
 * commission and physical-cash movement of one transaction commit together.
 */

export interface PostInput {
  type: CoreTransactionType;
  status?: TransactionStatus;
  sender: PartyRecord;
  receiver: PartyRecord;
  amount: number;
  senderFee?: number;
  receiverFee?: number;
  commission?: { userId: string; amount: number } | null;
  description: string;
  reference?: string | null;
  paymentMethod?: PaymentMethod | null;
  relatedTrxId?: string | null;
  createdAt?: string;
  /** For PENDING: when the transaction clears. */
  settleAt?: string | null;
  failureReason?: string | null;
  cashEffect?: { userId: string; delta: number } | null;
  /** For PENDING: hold the sender's funds in their pending balance. */
  holdSender?: boolean;
  /** For PENDING: credit the receiver's pending balance until cleared. */
  creditReceiverOnSettle?: boolean;
  settlementDirection?: "TO_BANK" | "FLOAT_TOP_UP" | null;
}

const trxIdCache = new WeakMap<DbState, Set<string>>();

function takenTrxIds(db: DbState) {
  let set = trxIdCache.get(db);
  if (!set) {
    set = new Set(db.transactions.map((t) => t.trxId));
    trxIdCache.set(db, set);
  }
  return set;
}

export function walletOf(db: DbState, userId: string): WalletRecord {
  const w = db.wallets.find((x) => x.userId === userId);
  if (!w) throw new ApiError("NOT_FOUND", "Wallet not found");
  return w;
}

function touch(w: WalletRecord, at: string) {
  w.version += 1;
  w.updatedAt = at;
}

function debit(db: DbState, userId: string, amount: number, at: string) {
  const w = walletOf(db, userId);
  if (w.available < amount) throw new ApiError("INSUFFICIENT_FUNDS", "Insufficient balance for this transaction");
  w.available -= amount;
  touch(w, at);
}

function credit(db: DbState, userId: string, amount: number, at: string) {
  const w = walletOf(db, userId);
  w.available += amount;
  touch(w, at);
}

function adjustCash(db: DbState, userId: string, delta: number, at: string) {
  const w = walletOf(db, userId);
  const next = (w.cashInHand ?? 0) + delta;
  if (next < 0) throw new ApiError("INSUFFICIENT_FUNDS", "Not enough physical cash recorded at the outlet");
  w.cashInHand = next;
  touch(w, at);
}

export function post(db: DbState, input: PostInput): TransactionRecord {
  const at = input.createdAt ?? new Date().toISOString();
  const status = input.status ?? "SUCCESSFUL";
  const senderFee = input.senderFee ?? 0;
  const receiverFee = input.receiverFee ?? 0;
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new ApiError("VALIDATION", "Amount must be a positive whole number of poisha");
  }

  const rec: TransactionRecord = {
    id: randomId("txn"),
    trxId: newTrxId(takenTrxIds(db)),
    type: input.type,
    status,
    amount: input.amount,
    senderFee,
    receiverFee,
    commission: status === "SUCCESSFUL" && input.commission?.amount ? input.commission : null,
    sender: input.sender,
    receiver: input.receiver,
    description: input.description,
    reference: input.reference ?? null,
    paymentMethod: input.paymentMethod ?? null,
    relatedTrxId: input.relatedTrxId ?? null,
    refundedAmount: 0,
    pendingHold: null,
    pendingCredit: null,
    cashEffect: null,
    settleAt: input.settleAt ?? null,
    failureReason: input.failureReason ?? null,
    createdAt: at,
    completedAt: status === "SUCCESSFUL" ? at : null,
    settlementDirection: input.settlementDirection ?? null,
  };

  if (status === "SUCCESSFUL") {
    if (input.sender.userId) debit(db, input.sender.userId, input.amount + senderFee, at);
    if (input.receiver.userId) credit(db, input.receiver.userId, input.amount - receiverFee, at);
    if (rec.commission) {
      credit(db, rec.commission.userId, rec.commission.amount, at);
      db.commissions.push({
        id: randomId("com"),
        agentId: rec.commission.userId,
        trxId: rec.trxId,
        type: rec.type,
        baseAmount: rec.amount,
        amount: rec.commission.amount,
        createdAt: at,
      });
    }
    if (input.cashEffect) {
      adjustCash(db, input.cashEffect.userId, input.cashEffect.delta, at);
      rec.cashEffect = input.cashEffect;
    }
  } else if (status === "PENDING") {
    if (input.holdSender && input.sender.userId) {
      const gross = input.amount + senderFee;
      debit(db, input.sender.userId, gross, at);
      walletOf(db, input.sender.userId).pending += gross;
      rec.pendingHold = { userId: input.sender.userId, amount: gross };
    } else if (input.sender.userId) {
      debit(db, input.sender.userId, input.amount + senderFee, at);
    }
    if (input.creditReceiverOnSettle && input.receiver.userId) {
      const net = input.amount - receiverFee;
      walletOf(db, input.receiver.userId).pending += net;
      rec.pendingCredit = { userId: input.receiver.userId, amount: net };
    }
    if (input.cashEffect) {
      adjustCash(db, input.cashEffect.userId, input.cashEffect.delta, at);
      rec.cashEffect = input.cashEffect;
    }
  }
  // FAILED / CANCELLED: recorded for history; no balance effect.

  db.transactions.push(rec);
  return rec;
}

/** Clears PENDING transactions whose settle time has passed. */
export function settleDue(db: DbState, now = Date.now()): TransactionRecord[] {
  const cleared: TransactionRecord[] = [];
  for (const t of db.transactions) {
    if (t.status !== "PENDING" || !t.settleAt || Date.parse(t.settleAt) > now) continue;
    const at = t.settleAt;
    if (t.pendingHold) {
      const w = walletOf(db, t.pendingHold.userId);
      w.pending -= t.pendingHold.amount;
      touch(w, at);
    }
    if (t.pendingCredit) {
      const w = walletOf(db, t.pendingCredit.userId);
      w.pending -= t.pendingCredit.amount;
      w.available += t.pendingCredit.amount;
      touch(w, at);
    }
    t.status = "SUCCESSFUL";
    t.completedAt = at;
    cleared.push(t);
  }
  return cleared;
}

export function findTxn(db: DbState, trxId: string) {
  return db.transactions.find((t) => t.trxId === trxId) ?? null;
}

export function isParty(t: TransactionRecord, userId: string) {
  return t.sender.userId === userId || t.receiver.userId === userId || t.commission?.userId === userId;
}
