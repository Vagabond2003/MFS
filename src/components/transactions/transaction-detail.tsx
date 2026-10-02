"use client";

import { useState } from "react";
import { Copy, Flag, Printer, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button, ButtonLink } from "@/components/ui/button";
import { TxnStatusBadge } from "@/components/ui/badge";
import { DescriptionList } from "@/components/ui/data";
import { Alert } from "@/components/ui/feedback";
import { Field, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { invalidate } from "@/hooks/use-api";
import { api, errorMessage } from "@/services";
import { formatDateTime, formatMoney } from "@/lib/utils";
import type { TransactionView } from "@/types/domain";
import { PAYMENT_METHOD_LABEL, TXN_META, TxnIcon } from "./meta";

/** Receipt view of a transaction, with role-appropriate follow-up actions. */
export function TransactionDetail({
  transaction: t,
  open,
  onClose,
  onChanged,
}: {
  transaction: TransactionView | null;
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (!t) return null;
  const close = () => {
    setDisputing(false);
    setReason("");
    onClose();
  };

  const rows = [
    { label: "Transaction ID", value: <span className="tabular font-mono">{t.trxId}</span> },
    { label: "Date & time", value: formatDateTime(t.createdAt) },
    { label: "From", value: `${t.sender.name} · ${t.sender.account}` },
    { label: "To", value: `${t.receiver.name} · ${t.receiver.account}` },
    { label: "Amount", value: formatMoney(t.amount) },
    { label: "Fee", value: t.fee ? formatMoney(t.fee) : "Free" },
    ...(t.commission ? [{ label: "Commission earned", value: formatMoney(t.commission) }] : []),
    ...(t.paymentMethod ? [{ label: "Payment method", value: PAYMENT_METHOD_LABEL[t.paymentMethod] }] : []),
    ...(t.refundedAmount ? [{ label: "Refunded", value: formatMoney(t.refundedAmount) }] : []),
    ...(t.relatedTrxId ? [{ label: "Related transaction", value: <span className="tabular font-mono">{t.relatedTrxId}</span> }] : []),
    ...(t.reference ? [{ label: "Reference", value: t.reference }] : []),
    { label: "Description", value: t.description },
  ];

  const submitDispute = async () => {
    setBusy(true);
    try {
      await api.transactions.raiseDispute(t.trxId, reason);
      toast.success("Dispute submitted. We'll keep you posted.");
      invalidate("notifications", "transactions");
      onChanged?.();
      close();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Transaction details"
      className="print-area"
      footer={
        disputing ? (
          <>
            <Button variant="outline" onClick={() => setDisputing(false)} disabled={busy}>
              Back
            </Button>
            <Button onClick={submitDispute} loading={busy} disabled={reason.trim().length < 10}>
              Submit dispute
            </Button>
          </>
        ) : (
          <>
            {t.canDispute && (
              <Button variant="ghost" onClick={() => setDisputing(true)}>
                <Flag className="h-4 w-4" aria-hidden /> Report a problem
              </Button>
            )}
            {t.canRefund && (
              <ButtonLink variant="outline" href={`/dashboard/merchant/refunds?trx=${t.trxId}`}>
                <RotateCcw className="h-4 w-4" aria-hidden /> Refund
              </ButtonLink>
            )}
            <Button variant="outline" onClick={() => window.print()} className="no-print">
              <Printer className="h-4 w-4" aria-hidden /> Print
            </Button>
            <Button
              onClick={() => {
                void navigator.clipboard?.writeText(t.trxId);
                toast.success("Transaction ID copied");
              }}
            >
              <Copy className="h-4 w-4" aria-hidden /> Copy ID
            </Button>
          </>
        )
      }
    >
      {disputing ? (
        <div className="space-y-4">
          <Alert tone="info">Disputes are reviewed by our support team, usually within 3 business days. You can raise one per transaction.</Alert>
          <Field label="What went wrong?" required hint="At least 10 characters">
            {(p) => (
              <Textarea {...p} rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. I was charged but the merchant didn't receive the payment." />
            )}
          </Field>
        </div>
      ) : (
        <div>
          <div className="mb-5 flex flex-col items-center text-center">
            <TxnIcon type={t.type} direction={t.direction} status={t.status} />
            <p className="mt-3 text-sm font-medium text-slate-500">{TXN_META[t.type].label}</p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
              {t.direction === "IN" ? "+" : "−"}
              {formatMoney(t.type === "COMMISSION" ? t.commission : t.total)}
            </p>
            <div className="mt-2">
              <TxnStatusBadge status={t.status} />
            </div>
          </div>
          <DescriptionList items={rows} />
        </div>
      )}
    </Modal>
  );
}
