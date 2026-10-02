"use client";

import { ChevronRight } from "lucide-react";
import { TxnStatusBadge } from "@/components/ui/badge";
import { Table, TD, TH, THead, TR } from "@/components/ui/data";
import { Skeleton } from "@/components/ui/feedback";
import { cn, formatDateTime, formatMoney, formatRelative } from "@/lib/utils";
import type { TransactionView } from "@/types/domain";
import { PAYMENT_METHOD_LABEL, TXN_META, TxnIcon } from "./meta";

export type TableVariant = "personal" | "agent" | "merchant" | "admin";

function Amount({ t }: { t: TransactionView }) {
  const failed = t.status === "FAILED" || t.status === "CANCELLED";
  const value = t.type === "COMMISSION" ? t.commission : t.amount;
  return (
    <span
      className={cn(
        "tabular font-semibold",
        failed ? "text-slate-400 line-through decoration-slate-300" : t.direction === "IN" ? "text-emerald-700" : "text-slate-900",
      )}
    >
      {t.direction === "IN" ? "+" : "−"}
      {formatMoney(value)}
    </span>
  );
}

function Counterparty({ t }: { t: TransactionView }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium text-slate-900">{t.counterparty.name}</p>
      <p className="tabular truncate text-xs text-slate-500">{t.counterparty.account}</p>
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
  onSelect?: (t: TransactionView) => void;
  loading?: boolean;
  emptyState?: React.ReactNode;
}) {
  if (loading && !items) return <TableSkeleton />;
  if (!items?.length) return <>{emptyState}</>;

  return (
    <>
      {/* Mobile: list */}
      <ul className="divide-y divide-slate-100 md:hidden">
        {items.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onSelect?.(t)}
              className="flex w-full items-center gap-3 px-5 py-3 text-left active:bg-slate-50"
            >
              <TxnIcon type={t.type} direction={t.direction} status={t.status} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{TXN_META[t.type].label}</p>
                <p className="truncate text-xs text-slate-500">
                  {t.counterparty.name} · {formatRelative(t.createdAt)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Amount t={t} />
                {t.status !== "SUCCESSFUL" && <TxnStatusBadge status={t.status} />}
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
              <TH>Transaction</TH>
              <TH>From</TH>
              <TH>To</TH>
              <TH>Date</TH>
              <TH align="right">Amount</TH>
              <TH align="right">Fees</TH>
              <TH>Status</TH>
            </>
          ) : (
            <>
              <TH>{variant === "personal" ? "Date" : "Transaction ID"}</TH>
              {variant === "personal" && <TH>Transaction ID</TH>}
              <TH>Type</TH>
              <TH>{variant === "merchant" ? "Customer" : variant === "agent" ? "Customer" : "Recipient / Sender"}</TH>
              {variant === "merchant" && <TH>Method</TH>}
              <TH align="right">Amount</TH>
              {variant === "agent" && <TH align="right">Commission</TH>}
              {variant !== "personal" && <TH>Date</TH>}
              <TH>Status</TH>
            </>
          )}
          <TH className="w-8" />
        </THead>
        <tbody>
          {items.map((t) =>
            variant === "admin" ? (
              <TR key={t.id} onClick={onSelect ? () => onSelect(t) : undefined}>
                <TD>
                  <div className="flex items-center gap-3">
                    <TxnIcon type={t.type} direction="OUT" status={t.status} size="sm" />
                    <div>
                      <p className="font-medium text-slate-900">{TXN_META[t.type].label}</p>
                      <p className="tabular font-mono text-xs text-slate-500">{t.trxId}</p>
                    </div>
                  </div>
                </TD>
                <TD>
                  <p className="font-medium text-slate-800">{t.sender.name}</p>
                  <p className="tabular text-xs text-slate-500">{t.sender.account}</p>
                </TD>
                <TD>
                  <p className="font-medium text-slate-800">{t.receiver.name}</p>
                  <p className="tabular text-xs text-slate-500">{t.receiver.account}</p>
                </TD>
                <TD className="whitespace-nowrap text-slate-600">{formatDateTime(t.createdAt)}</TD>
                <TD align="right">
                  <span className="tabular font-semibold text-slate-900">{formatMoney(t.amount)}</span>
                </TD>
                <TD align="right" className="tabular text-slate-600">
                  {t.fee ? formatMoney(t.fee) : "—"}
                </TD>
                <TD>
                  <TxnStatusBadge status={t.status} />
                </TD>
                <TD>
                  <ChevronRight className="h-4 w-4 text-slate-300" aria-hidden />
                </TD>
              </TR>
            ) : (
              <TR key={t.id} onClick={onSelect ? () => onSelect(t) : undefined}>
                {variant === "personal" ? (
                  <>
                    <TD className="whitespace-nowrap text-slate-600">{formatDateTime(t.createdAt)}</TD>
                    <TD className="tabular font-mono text-xs text-slate-600">{t.trxId}</TD>
                  </>
                ) : (
                  <TD className="tabular font-mono text-xs text-slate-600">{t.trxId}</TD>
                )}
                <TD>
                  <div className="flex items-center gap-2.5">
                    <TxnIcon type={t.type} direction={t.direction} status={t.status} size="sm" />
                    <span className="whitespace-nowrap font-medium text-slate-800">{TXN_META[t.type].label}</span>
                  </div>
                </TD>
                <TD>
                  <Counterparty t={t} />
                </TD>
                {variant === "merchant" && <TD className="whitespace-nowrap text-slate-600">{t.paymentMethod ? PAYMENT_METHOD_LABEL[t.paymentMethod] : "—"}</TD>}
                <TD align="right">
                  <Amount t={t} />
                </TD>
                {variant === "agent" && (
                  <TD align="right" className="tabular font-medium text-slate-700">
                    {t.commission ? formatMoney(t.commission) : "—"}
                  </TD>
                )}
                {variant !== "personal" && <TD className="whitespace-nowrap text-slate-600">{formatDateTime(t.createdAt)}</TD>}
                <TD>
                  <TxnStatusBadge status={t.status} />
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
