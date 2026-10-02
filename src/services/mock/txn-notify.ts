import { formatMoney } from "@/lib/utils";
import type { NotificationType } from "@/types/domain";
import type { DbState, TransactionRecord } from "./schema";
import { notify } from "./context";

/** Builds the per-party notification for a posted transaction. */
export function describeForUser(
  t: TransactionRecord,
  userId: string,
): { type: NotificationType; title: string; body: string } | null {
  const amt = formatMoney(t.amount);
  const ref = `TrxID ${t.trxId}`;
  const isSender = t.sender.userId === userId;
  const isReceiver = t.receiver.userId === userId;

  if (t.status === "FAILED") {
    if (!isSender) return null;
    return {
      type: "PAYMENT_FAILED",
      title: "Transaction failed",
      body: `${labelOf(t)} of ${amt} to ${t.receiver.name} failed${t.failureReason ? ` — ${t.failureReason}` : ""}. No money was deducted.`,
    };
  }

  if (t.type === "SETTLEMENT") {
    const pending = t.status === "PENDING";
    return {
      type: "AGENT_SETTLEMENT",
      title: pending ? "Settlement in process" : "Settlement completed",
      body:
        t.settlementDirection === "FLOAT_TOP_UP"
          ? `Float top-up of ${amt} ${pending ? "is being processed" : "was credited to your e-money balance"}. ${ref}`
          : `Settlement of ${amt} to ${t.receiver.name} ${t.receiver.account} ${pending ? "is being processed" : "was completed"}. ${ref}`,
    };
  }

  if (isReceiver) {
    switch (t.type) {
      case "SEND_MONEY":
        return { type: "MONEY_RECEIVED", title: "Money received", body: `You received ${amt} from ${t.sender.name}. ${ref}` };
      case "CASH_IN":
        return { type: "MONEY_RECEIVED", title: "Cash In successful", body: `${amt} was added to your wallet by ${t.sender.name}. ${ref}` };
      case "ADD_MONEY":
        return t.status === "PENDING"
          ? { type: "MONEY_RECEIVED", title: "Add Money processing", body: `${amt} from ${t.sender.name} is clearing and will be available shortly. ${ref}` }
          : { type: "MONEY_RECEIVED", title: "Money added", body: `${amt} was added from ${t.sender.name}. ${ref}` };
      case "REFUND":
        return { type: "MONEY_RECEIVED", title: "Refund received", body: `${t.sender.name} refunded ${amt}. ${ref}` };
      case "MERCHANT_PAYMENT":
        return {
          type: "MERCHANT_PAYMENT",
          title: "Payment received",
          body: `${amt} received from ${t.sender.name}${t.paymentMethod === "QR_SCAN" ? " via QR" : ""}. ${ref}`,
        };
      case "CASH_OUT":
        return {
          type: "PAYMENT_SUCCESS",
          title: "Cash Out completed",
          body: `Paid ${amt} cash to ${t.sender.name}. You earned ${formatMoney(t.commission?.amount ?? 0)} commission. ${ref}`,
        };
      default:
        return null;
    }
  }

  if (isSender) {
    switch (t.type) {
      case "SEND_MONEY":
        return { type: "MONEY_SENT", title: "Money sent", body: `You sent ${amt} to ${t.receiver.name}. Fee ${formatMoney(t.senderFee)}. ${ref}` };
      case "CASH_IN":
        return {
          type: "PAYMENT_SUCCESS",
          title: "Cash In completed",
          body: `Cash In of ${amt} to ${t.receiver.name}. You earned ${formatMoney(t.commission?.amount ?? 0)} commission. ${ref}`,
        };
      case "REFUND":
        return { type: "PAYMENT_SUCCESS", title: "Refund issued", body: `You refunded ${amt} to ${t.receiver.name}. ${ref}` };
      default:
        return {
          type: "PAYMENT_SUCCESS",
          title: `${labelOf(t)} successful`,
          body: `${labelOf(t)} of ${amt} to ${t.receiver.name}. ${ref}`,
        };
    }
  }
  return null;
}

function labelOf(t: TransactionRecord) {
  const map: Record<TransactionRecord["type"], string> = {
    SEND_MONEY: "Send Money",
    CASH_IN: "Cash In",
    CASH_OUT: "Cash Out",
    MOBILE_RECHARGE: "Mobile recharge",
    MERCHANT_PAYMENT: "Payment",
    BILL_PAYMENT: "Bill payment",
    ADD_MONEY: "Add Money",
    REFUND: "Refund",
    COMMISSION: "Commission",
    SETTLEMENT: "Settlement",
  };
  return map[t.type];
}

export function notifyParties(db: DbState, t: TransactionRecord, at?: string) {
  const ids = new Set([t.sender.userId, t.receiver.userId].filter((x): x is string => !!x));
  for (const userId of ids) {
    const n = describeForUser(t, userId);
    if (n) notify(db, userId, n.type, n.title, n.body, `/transactions?trx=${t.trxId}`, at);
  }
}
