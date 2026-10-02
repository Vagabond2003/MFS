import {
  ArrowDownLeft,
  ArrowDownToLine,
  Banknote,
  CirclePlus,
  Landmark,
  Percent,
  ReceiptText,
  RotateCcw,
  Send,
  Smartphone,
  Store,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PaymentMethod, Role, TransactionStatus, TransactionType } from "@/types/domain";

export const TXN_META: Record<TransactionType, { label: string; icon: LucideIcon }> = {
  SEND_MONEY: { label: "Send Money", icon: Send },
  RECEIVE_MONEY: { label: "Received Money", icon: ArrowDownLeft },
  CASH_IN: { label: "Cash In", icon: ArrowDownToLine },
  CASH_OUT: { label: "Cash Out", icon: Banknote },
  MOBILE_RECHARGE: { label: "Mobile Recharge", icon: Smartphone },
  MERCHANT_PAYMENT: { label: "Merchant Payment", icon: Store },
  BILL_PAYMENT: { label: "Bill Payment", icon: ReceiptText },
  ADD_MONEY: { label: "Add Money", icon: CirclePlus },
  REFUND: { label: "Refund", icon: RotateCcw },
  COMMISSION: { label: "Commission", icon: Percent },
  SETTLEMENT: { label: "Settlement", icon: Landmark },
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  QR_SCAN: "QR scan",
  MERCHANT_ID: "Merchant ID",
  PAYMENT_LINK: "Payment link",
  ONLINE_CHECKOUT: "Online checkout",
};

/** Transaction types a role can filter by (what can appear in their history). */
export const ROLE_TXN_TYPES: Record<Role, TransactionType[]> = {
  PERSONAL: ["SEND_MONEY", "RECEIVE_MONEY", "CASH_IN", "CASH_OUT", "MOBILE_RECHARGE", "MERCHANT_PAYMENT", "BILL_PAYMENT", "ADD_MONEY", "REFUND"],
  AGENT: ["CASH_IN", "CASH_OUT", "MOBILE_RECHARGE", "BILL_PAYMENT", "SETTLEMENT", "COMMISSION"],
  MERCHANT: ["MERCHANT_PAYMENT", "REFUND", "SETTLEMENT"],
  ADMIN: ["SEND_MONEY", "CASH_IN", "CASH_OUT", "MOBILE_RECHARGE", "MERCHANT_PAYMENT", "BILL_PAYMENT", "ADD_MONEY", "REFUND", "SETTLEMENT"],
};

export function TxnIcon({
  type,
  direction,
  status,
  size = "md",
}: {
  type: TransactionType;
  direction: "IN" | "OUT";
  status: TransactionStatus;
  size?: "sm" | "md";
}) {
  const Icon = TXN_META[type].icon;
  const failed = status === "FAILED" || status === "CANCELLED";
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-xl",
        size === "md" ? "h-10 w-10" : "h-8 w-8",
        failed ? "bg-rose-50 text-rose-500" : direction === "IN" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-600",
      )}
      aria-hidden
    >
      <Icon className={size === "md" ? "h-[18px] w-[18px]" : "h-4 w-4"} />
    </span>
  );
}
