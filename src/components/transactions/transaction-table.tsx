"use client";

import { ChevronRight } from "lucide-react";
import { TxnStatusBadge } from "@/components/ui/badge";
import { Table, TD, TH, THead, TR } from "@/components/ui/data";
import { Skeleton } from "@/components/ui/feedback";
import { cn, formatDateTime, formatMoney, formatRelative } from "@/lib/utils";
import type { TransactionView } from "@/types/domain";
import { useI18n } from "@/hooks/use-i18n";
import { PAYMENT_METHOD_LABEL, TXN_META, TxnIcon } from "./meta";

export type TableVariant = "personal" | "agent" | "merchant" | "admin";

function Amount({ txn }: { txn: TransactionView }) {
  const failed = txn.status === "FAILED" || txn.status === "CANCELLED";
  const value = txn.type === "COMMISSION" ? txn.commission : txn.amount;
  return (
    <span
      className={cn(
        "tabular font-semibold",
        failed ? "text-slate-400 line-through decoration-slate-300" : txn.direction === "IN" ? "text-emerald-700" : "text-slate-900",
      )}
    >
      {txn.direction === "IN" ? "+" : "−"}
      {formatMoney(value)}
    </span>
  );
}

function Counterparty({ txn }: { txn: TransactionView }) {
  const { t } = useI18n();
  return (
    <div className="min-w-0">
      <p className="truncate font-medium text-slate-900">{t(txn.counterparty.name)}</p>
      <p className="tabular truncate text-xs text-slate-500">{txn.counterparty.account}</p>
    </div>
  );
}

export function TransactionTable({
  items,
  variant,
  onSelect,
  loading,
  emptyState,
}: {
  items: TransactionView[] | undefined;
  variant: TableVariant;
  onSelect?: (txn: TransactionView) => void;
  loading?: boolean;
  emptyState?: React.ReactNode;
}) {
  const { t, lang } = useI18n();
  if (loading && !items) return <TableSkeleton />;
  if (!items?.length) return <>{emptyState}</>;

  return (
    <>
      {/* Mobile: list */}
      <ul className="divide-y divide-slate-100 md:hidden">
        {items.map((txn) => (
          <li key={txn.id}>
            <button
              type="button"
              onClick={() => onSelect?.(txn)}
              className="flex w-full items-center gap-3 px-5 py-3 text-left active:bg-slate-50"
            >
              <TxnIcon type={txn.type} direction={txn.direction} status={txn.status} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{t(TXN_META[txn.type].label)}</p>
                <p className="truncate text-xs text-slate-500">
                  {t(txn.counterparty.name)} · {formatRelative(txn.createdAt, lang)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Amount txn={txn} />
                {txn.status !== "SUCCESSFUL" && <TxnStatusBadge status={txn.status} />}
              </div>
            </button>
          </li>
        ))}
      </ul>

      {/* Desktop: table */}
      <Table className="hidden md:block">
        <THead>
          {variant === "admin" ? (
            <>
              <TH>{t("Transaction")}</TH>
              <TH>{t("From")}</TH>
              <TH>{t("To")}</TH>
              <TH>{t("Date")}</TH>
              <TH align="right">{t("Amount")}</TH>
              <TH align="right">{t("Fees")}</TH>
              <TH>{t("Status")}</TH>
            </>
          ) : (
            <>
              <TH>{variant === "personal" ? t("Date") : t("Transaction ID")}</TH>
              {variant === "personal" && <TH>{t("Transaction ID")}</TH>}
              <TH>{t("Type")}</TH>
              <TH>{variant === "personal" ? t("Recipient / Sender") : t("Customer")}</TH>
              {variant === "merchant" && <TH>{t("Method")}</TH>}
              <TH align="right">{t("Amount")}</TH>
              {variant === "agent" && <TH align="right">{t("Commission")}</TH>}
              {variant !== "personal" && <TH>{t("Date")}</TH>}
              <TH>{t("Status")}</TH>
            </>
          )}
          <TH className="w-8" />
        </THead>
        <tbody>
          {items.map((txn) =>
            variant === "admin" ? (
              <TR key={txn.id} onClick={onSelect ? () => onSelect(txn) : undefined}>
                <TD>
                  <div className="flex items-center gap-3">
                    <TxnIcon type={txn.type} direction="OUT" status={txn.status} size="sm" />
                    <div>
                      <p className="font-medium text-slate-900">{t(TXN_META[txn.type].label)}</p>
                      <p className="tabular font-mono text-xs text-slate-500">{txn.trxId}</p>
                    </div>
                  </div>
                </TD>
                <TD>
                  <p className="font-medium text-slate-800">{t(txn.sender.name)}</p>
                  <p className="tabular text-xs text-slate-500">{txn.sender.account}</p>
                </TD>
                <TD>
                  <p className="font-medium text-slate-800">{t(txn.receiver.name)}</p>
                  <p className="tabular text-xs text-slate-500">{txn.receiver.account}</p>
                </TD>
                <TD className="whitespace-nowrap text-slate-600">{formatDateTime(txn.createdAt, lang)}</TD>
                <TD align="right">
                  <span className="tabular font-semibold text-slate-900">{formatMoney(txn.amount)}</span>
                </TD>
                <TD align="right" className="tabular text-slate-600">
                  {txn.fee ? formatMoney(txn.fee) : "—"}
                </TD>
                <TD>
                  <TxnStatusBadge status={txn.status} />
                </TD>
                <TD>
                  <ChevronRight className="h-4 w-4 text-slate-300" aria-hidden />
                </TD>
              </TR>
            ) : (
              <TR key={txn.id} onClick={onSelect ? () => onSelect(txn) : undefined}>
                {variant === "personal" ? (
                  <>
                    <TD className="whitespace-nowrap text-slate-600">{formatDateTime(txn.createdAt, lang)}</TD>
                    <TD className="tabular font-mono text-xs text-slate-600">{txn.trxId}</TD>
                  </>
                ) : (
                  <TD className="tabular font-mono text-xs text-slate-600">{txn.trxId}</TD>
                )}
                <TD>
                  <div className="flex items-center gap-2.5">
                    <TxnIcon type={txn.type} direction={txn.direction} status={txn.status} size="sm" />
                    <span className="whitespace-nowrap font-medium text-slate-800">{t(TXN_META[txn.type].label)}</span>
                  </div>
                </TD>
                <TD>
                  <Counterparty txn={txn} />
                </TD>
                {variant === "merchant" && <TD className="whitespace-nowrap text-slate-600">{txn.paymentMethod ? t(PAYMENT_METHOD_LABEL[txn.paymentMethod]) : "—"}</TD>}
                <TD align="right">
                  <Amount txn={txn} />
                </TD>
                {variant === "agent" && (
                  <TD align="right" className="tabular font-medium text-slate-700">
                    {txn.commission ? formatMoney(txn.commission) : "—"}
                  </TD>
                )}
                {variant !== "personal" && <TD className="whitespace-nowrap text-slate-600">{formatDateTime(txn.createdAt, lang)}</TD>}
                <TD>
                  <TxnStatusBadge status={txn.status} />
                </TD>
                <TD>
                  <ChevronRight className="h-4 w-4 text-slate-300" aria-hidden />
                </TD>
              </TR>
            ),
          )}
        </tbody>
      </Table>
    </>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-3 px-5 py-4 sm:px-6" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}
