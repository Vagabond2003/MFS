"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { format, subDays } from "date-fns";
import { Receipt, Search, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pagination } from "@/components/ui/data";
import { EmptyState, ErrorState } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/form";
import { useApi } from "@/hooks/use-api";
import { api } from "@/services";
import { cn } from "@/lib/utils";
import { msg } from "@/lib/i18n/core";
import { useI18n } from "@/hooks/use-i18n";
import { TRANSACTION_STATUSES, type Paginated, type Role, type TransactionQuery, type TransactionView } from "@/types/domain";
import { ROLE_TXN_TYPES, TXN_META } from "./meta";
import { TransactionDetail } from "./transaction-detail";
import { TransactionTable, type TableVariant } from "./transaction-table";

const PRESETS = [
  { key: "all", label: msg("All time") },
  { key: "7", label: msg("7 days") },
  { key: "30", label: msg("30 days") },
  { key: "90", label: msg("90 days") },
  { key: "custom", label: msg("Custom") },
] as const;
type Preset = (typeof PRESETS)[number]["key"];

type HistoryProps = {
  role: Role;
  fetcher?: (q: TransactionQuery) => Promise<Paginated<TransactionView>>;
  variant: TableVariant;
  pageSize?: number;
  fixedType?: TransactionQuery["type"];
};

/**
 * Searchable, filterable, paginated history. Used by every role; the API
 * scopes results to what the caller is allowed to see.
 */
export function TransactionHistory(props: HistoryProps) {
  return (
    <Suspense fallback={<Card className="h-96 animate-pulse" />}>
      <HistoryInner {...props} />
    </Suspense>
  );
}

function HistoryInner({
  role,
  fetcher,
  variant,
  pageSize = 10,
  fixedType,
}: HistoryProps) {
  const { t } = useI18n();
  const params = useSearchParams();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [type, setType] = useState<TransactionQuery["type"]>(fixedType ?? "ALL");
  const [status, setStatus] = useState<TransactionQuery["status"]>("ALL");
  const [preset, setPreset] = useState<Preset>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<TransactionView | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const range = (() => {
    if (preset === "custom") return { from: from || undefined, to: to || undefined };
    if (preset === "all") return {};
    return { from: format(subDays(new Date(), Number(preset)), "yyyy-MM-dd") };
  })();

  const query: TransactionQuery = { search: debounced, type, status, page, pageSize, ...range };
  const list = useApi(() => (fetcher ?? api.transactions.list)(query), [JSON.stringify(query)], { tags: ["transactions"] });

  // Deep link: /transactions?trx=XXXX opens the receipt.
  const trxParam = params.get("trx");
  useEffect(() => {
    if (!trxParam || role === "ADMIN") return;
    let cancelled = false;
    api.transactions
      .get(trxParam)
      .then((found) => !cancelled && setSelected(found))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [trxParam, role]);

  const filtersActive = !!debounced || (type !== "ALL" && !fixedType) || status !== "ALL" || preset !== "all";
  const reset = () => {
    setSearch("");
    setType(fixedType ?? "ALL");
    setStatus("ALL");
    setPreset("all");
    setFrom("");
    setTo("");
    setPage(1);
  };

  return (
    <Card>
      <div className="space-y-3 border-b border-slate-100 p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="flex-1">
            <Input
              aria-label={t("Search transactions")}
              placeholder={t("Search by transaction ID, name or number")}
              leading={<Search className="h-4 w-4" />}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:flex">
            {!fixedType && (
              <Select
                aria-label={t("Transaction type")}
                value={type}
                onChange={(e) => {
                  setType(e.target.value as TransactionQuery["type"]);
                  setPage(1);
                }}
                className="sm:w-48"
              >
                <option value="ALL">{t("All types")}</option>
                {ROLE_TXN_TYPES[role].map((type) => (
                  <option key={type} value={type}>
                    {t(TXN_META[type].label)}
                  </option>
                ))}
              </Select>
            )}
            <Select
              aria-label={t("Status")}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as TransactionQuery["status"]);
                setPage(1);
              }}
              className="sm:w-40"
            >
              <option value="ALL">{t("All statuses")}</option>
              {TRANSACTION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(s.charAt(0) + s.slice(1).toLowerCase())}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label={t("Date range")} className="no-scrollbar flex gap-1 overflow-x-auto">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                role="radio"
                aria-checked={preset === p.key}
                onClick={() => {
                  setPreset(p.key);
                  setPage(1);
                }}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition",
                  preset === p.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
                )}
              >
                {t(p.label)}
              </button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="flex items-center gap-2">
              <Input type="date" aria-label={t("From date")} value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="h-9 w-40 text-sm" />
              <span className="text-slate-400">–</span>
              <Input type="date" aria-label={t("To date")} value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="h-9 w-40 text-sm" />
            </div>
          )}
          {filtersActive && (
            <button type="button" onClick={reset} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800">
              <X className="h-3.5 w-3.5" aria-hidden /> {t("Clear filters")}
            </button>
          )}
        </div>
      </div>

      {list.error ? (
        <ErrorState message={list.error.message} onRetry={list.reload} />
      ) : (
        <div className={cn("transition-opacity", list.refreshing && "opacity-60")}>
          <TransactionTable
            items={list.data?.items}
            variant={variant}
            loading={list.loading}
            onSelect={setSelected}
            emptyState={
              <EmptyState
                icon={<Receipt className="h-6 w-6" />}
                title={filtersActive ? t("No matching transactions") : t("No transactions yet")}
                description={filtersActive ? t("Try a different search or clear the filters.") : t("Your transactions will appear here.")}
              />
            }
          />
          {list.data && (
            <Pagination page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} pageSize={list.data.pageSize} onChange={setPage} />
          )}
        </div>
      )}

      <TransactionDetail transaction={selected} open={!!selected} onClose={() => setSelected(null)} onChanged={list.reload} />
    </Card>
  );
}
