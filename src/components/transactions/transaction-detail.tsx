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
import { useI18n } from "@/hooks/use-i18n";
import { PAYMENT_METHOD_LABEL, TXN_META, TxnIcon } from "./meta";

/** Receipt view of a transaction, with role-appropriate follow-up actions. */
export function TransactionDetail({
  transaction: txn,
  open,
  onClose,
  onChanged,
}: {
  transaction: TransactionView | null;
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { t, lang } = useI18n();
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (!txn) return null;
  const close = () => {
    setDisputing(false);
    setReason("");
    onClose();
  };

  const rows = [
    { label: t("Transaction ID"), value: <span className="tabular font-mono">{txn.trxId}</span> },
    { label: t("Date & time"), value: formatDateTime(txn.createdAt, lang) },
    { label: t("From"), value: `${t(txn.sender.name)} · ${txn.sender.account}` },
    { label: t("To"), value: `${t(txn.receiver.name)} · ${txn.receiver.account}` },
    { label: t("Amount"), value: formatMoney(txn.amount) },
    { label: t("Fee"), value: txn.fee ? formatMoney(txn.fee) : t("Free") },
    ...(txn.commission ? [{ label: t("Commission earned"), value: formatMoney(txn.commission) }] : []),
    ...(txn.paymentMethod ? [{ label: t("Payment method"), value: t(PAYMENT_METHOD_LABEL[txn.paymentMethod]) }] : []),
    ...(txn.refundedAmount ? [{ label: t("Refunded"), value: formatMoney(txn.refundedAmount) }] : []),
    ...(txn.relatedTrxId ? [{ label: t("Related transaction"), value: <span className="tabular font-mono">{txn.relatedTrxId}</span> }] : []),
    ...(txn.reference ? [{ label: t("Reference"), value: txn.reference }] : []),
    { label: t("Description"), value: t(txn.description) },
  ];

  const submitDispute = async () => {
    setBusy(true);
    try {
      await api.transactions.raiseDispute(txn.trxId, reason);
      toast.success(t("Dispute submitted. We'll keep you posted."));
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
      title={t("Transaction details")}
      className="print-area"
      footer={
        disputing ? (
          <>
            <Button variant="outline" onClick={() => setDisputing(false)} disabled={busy}>
              {t("Back")}
            </Button>
            <Button onClick={submitDispute} loading={busy} disabled={reason.trim().length < 10}>
              {t("Submit dispute")}
            </Button>
          </>
        ) : (
          <>
            {txn.canDispute && (
              <Button variant="ghost" onClick={() => setDisputing(true)}>
                <Flag className="h-4 w-4" aria-hidden /> {t("Report a problem")}
              </Button>
            )}
            {txn.canRefund && (
              <ButtonLink variant="outline" href={`/dashboard/merchant/refunds?trx=${txn.trxId}`}>
                <RotateCcw className="h-4 w-4" aria-hidden /> {t("Refund")}
              </ButtonLink>
            )}
            <Button variant="outline" onClick={() => window.print()} className="no-print">
              <Printer className="h-4 w-4" aria-hidden /> {t("Print")}
            </Button>
            <Button
              onClick={() => {
                void navigator.clipboard?.writeText(txn.trxId);
                toast.success(t("Transaction ID copied"));
              }}
            >
              <Copy className="h-4 w-4" aria-hidden /> {t("Copy ID")}
            </Button>
          </>
        )
      }
    >
      {disputing ? (
        <div className="space-y-4">
          <Alert tone="info">{t("Disputes are reviewed by our support team, usually within 3 business days. You can raise one per transaction.")}</Alert>
          <Field label={t("What went wrong?")} required hint={t("At least 10 characters")}>
            {(p) => (
              <Textarea {...p} rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("e.g. I was charged but the merchant didn't receive the payment.")} />
            )}
          </Field>
        </div>
      ) : (
        <div>
          <div className="mb-5 flex flex-col items-center text-center">
            <TxnIcon type={txn.type} direction={txn.direction} status={txn.status} />
            <p className="mt-3 text-sm font-medium text-slate-500">{t(TXN_META[txn.type].label)}</p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
              {txn.direction === "IN" ? "+" : "−"}
              {formatMoney(txn.type === "COMMISSION" ? txn.commission : txn.total)}
            </p>
            <div className="mt-2">
              <TxnStatusBadge status={txn.status} />
            </div>
          </div>
          <DescriptionList items={rows} />
        </div>
      )}
    </Modal>
  );
}
