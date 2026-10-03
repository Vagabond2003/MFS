"use client";

import { useEffect, useState } from "react";
import { Gavel, ScrollText, Search } from "lucide-react";
import { toast } from "sonner";
import { DisputeStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { DescriptionList, Pagination, Table, Tabs, TD, TH, THead, TR } from "@/components/ui/data";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { ChoiceChips, Field, Input, Textarea } from "@/components/ui/form";
import { Sheet } from "@/components/ui/modal";
import { TransactionHistory } from "@/components/transactions/transaction-history";
import { invalidate, useApi } from "@/hooks/use-api";
import { api } from "@/services";
import { useI18n } from "@/hooks/use-i18n";
import { toApiError } from "@/services/errors";
import { ROLE_LABEL } from "@/lib/auth/access";
import { formatDateTime, formatMoney, formatRelative } from "@/lib/utils";
import type { DisputeStatus, DisputeView } from "@/types/domain";

/* ───────────── Transactions ───────────── */

export function AdminTransactions() {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t("Admin")} title={t("Transactions")} description={t("Every transaction on the platform. Party details are masked; full records are available to compliance via the back office.")} />
      <TransactionHistory role="ADMIN" variant="admin" fetcher={api.admin.transactions} pageSize={15} />
    </div>
  );
}

/* ───────────── Disputes ───────────── */

export function AdminDisputes() {
  const { t, lang } = useI18n();
  const [status, setStatus] = useState<DisputeStatus | "ALL">("ALL");
  const [selected, setSelected] = useState<DisputeView | null>(null);
  const list = useApi(() => api.admin.disputes({ status }), [status], { tags: ["admin"] });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t("Admin")} title={t("Disputes")} description={t("Customer-reported problems with transactions.")} />
      <Card>
        <div className="border-b border-slate-100 p-4">
          <Tabs<DisputeStatus | "ALL">
            ariaLabel={t("Dispute status")}
            value={status}
            onChange={setStatus}
            tabs={[
              { value: "ALL", label: t("All") },
              { value: "OPEN", label: t("Open") },
              { value: "INVESTIGATING", label: t("Investigating") },
              { value: "RESOLVED", label: t("Resolved") },
              { value: "REJECTED", label: t("Rejected") },
            ]}
            className="inline-flex max-w-full"
          />
        </div>
        {list.error ? (
          <ErrorState message={list.error.message} onRetry={list.reload} />
        ) : list.loading ? (
          <Skeleton className="m-6 h-40" />
        ) : !list.data?.length ? (
          <EmptyState icon={<Gavel className="h-6 w-6" />} title={t("No disputes")} />
        ) : (
          <Table>
            <THead>
              <TH>{t("Transaction")}</TH>
              <TH>{t("Raised by")}</TH>
              <TH>{t("Reason")}</TH>
              <TH align="right">{t("Amount")}</TH>
              <TH>{t("Opened")}</TH>
              <TH>{t("Status")}</TH>
            </THead>
            <tbody>
              {list.data.map((d) => (
                <TR key={d.id} onClick={() => setSelected(d)}>
                  <TD className="tabular font-mono text-xs">{d.trxId}</TD>
                  <TD>
                    <p className="font-medium text-slate-900">{d.raisedBy.name}</p>
                    <p className="text-xs text-slate-500">{t(ROLE_LABEL[d.raisedBy.role])}</p>
                  </TD>
                  <TD className="max-w-xs truncate text-slate-600">{d.reason}</TD>
                  <TD align="right" className="tabular font-semibold">
                    {formatMoney(d.amount)}
                  </TD>
                  <TD className="whitespace-nowrap text-slate-500">{formatRelative(d.createdAt, lang)}</TD>
                  <TD>
                    <DisputeStatusBadge status={d.status} />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <DisputeDrawer dispute={selected} onClose={() => setSelected(null)} onChanged={list.reload} />
    </div>
  );
}

function DisputeDrawer({ dispute, onClose, onChanged }: { dispute: DisputeView | null; onClose: () => void; onChanged: () => void }) {
  const { t } = useI18n();
  return (
    <Sheet open={!!dispute} onClose={onClose} title={t("Dispute")} description={dispute ? t("Transaction {id}", { id: dispute.trxId }) : undefined}>
      {dispute && <DisputeForm key={dispute.id} dispute={dispute} onClose={onClose} onChanged={onChanged} />}
    </Sheet>
  );
}

function DisputeForm({ dispute, onClose, onChanged }: { dispute: DisputeView; onClose: () => void; onChanged: () => void }) {
  const { t, lang } = useI18n();
  const [status, setStatus] = useState<DisputeStatus>(dispute.status);
  const [resolution, setResolution] = useState(dispute.resolution ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.admin.updateDispute(dispute.id, status, resolution);
      toast.success(t("Dispute updated and customer notified"));
      onChanged();
      invalidate("admin");
      onClose();
    } catch (e) {
      toast.error(toApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <DescriptionList
        items={[
          { label: t("Status"), value: <DisputeStatusBadge status={dispute.status} /> },
          { label: t("Raised by"), value: `${dispute.raisedBy.name} (${t(ROLE_LABEL[dispute.raisedBy.role])})` },
          { label: t("Amount"), value: formatMoney(dispute.amount) },
          { label: t("Opened"), value: formatDateTime(dispute.createdAt, lang) },
          { label: t("Last update"), value: formatDateTime(dispute.updatedAt, lang) },
        ]}
      />
      <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{t("Customer's description")}</p>
        {dispute.reason}
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-700">{t("Update status")}</p>
        <ChoiceChips<DisputeStatus>
          ariaLabel={t("Dispute status")}
          value={status}
          onChange={setStatus}
          options={[
            { value: "OPEN", label: t("Open") },
            { value: "INVESTIGATING", label: t("Investigating") },
            { value: "RESOLVED", label: t("Resolved") },
            { value: "REJECTED", label: t("Rejected") },
          ]}
        />
      </div>
      <Field label={t("Resolution note")} hint={t("Required when resolving or rejecting. Sent to the customer.")}>
        {(p) => <Textarea {...p} rows={4} value={resolution} onChange={(e) => setResolution(e.target.value)} />}
      </Field>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button variant="outline" onClick={onClose} disabled={busy}>
          {t("Cancel")}
        </Button>
        <Button onClick={save} loading={busy}>
          {t("Save & notify customer")}
        </Button>
      </div>
    </div>
  );
}

/* ───────────── Audit logs ───────────── */

const ACTIONS = [
  "ALL",
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "LOGOUT",
  "USER_REGISTERED",
  "VERIFICATION_APPROVED",
  "VERIFICATION_REJECTED",
  "VERIFICATION_REVIEW_STARTED",
  "USER_SUSPENDED",
  "USER_REACTIVATED",
  "PIN_FAILED",
  "PASSWORD_CHANGED",
  "DISPUTE_RAISED",
  "DISPUTE_UPDATED",
];

export function AdminAuditLogs() {
  const { t, lang } = useI18n();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [action, setAction] = useState("ALL");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const logs = useApi(() => api.admin.auditLogs({ search: debounced, action, page, pageSize: 20 }), [debounced, action, page], { tags: ["admin"] });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t("Admin")} title={t("Audit logs")} description={t("Append-only record of sign-ins, money movement and administrative actions.")} />
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
          <div className="flex-1">
            <Input aria-label={t("Search audit logs")} placeholder={t("Search action, actor or target")} leading={<Search className="h-4 w-4" />} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <select
            aria-label={t("Action")}
            value={action}
            onChange={(e) => { setAction(e.target.value); setPage(1); }}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm sm:w-64"
          >
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a === "ALL" ? t("All actions") : a}
              </option>
            ))}
          </select>
        </div>
        {logs.error ? (
          <ErrorState message={logs.error.message} onRetry={logs.reload} />
        ) : logs.loading ? (
          <Skeleton className="m-6 h-64" />
        ) : !logs.data?.items.length ? (
          <EmptyState icon={<ScrollText className="h-6 w-6" />} title={t("No matching events")} />
        ) : (
          <>
            <Table>
              <THead>
                <TH>{t("When")}</TH>
                <TH>{t("Action")}</TH>
                <TH>{t("Actor")}</TH>
                <TH>{t("Target")}</TH>
                <TH>{t("Details")}</TH>
                <TH>IP</TH>
              </THead>
              <tbody>
                {logs.data.items.map((e) => (
                  <TR key={e.id}>
                    <TD className="whitespace-nowrap text-slate-500">{formatDateTime(e.createdAt, lang)}</TD>
                    <TD>
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700">{e.action}</span>
                    </TD>
                    <TD>
                      <p className="font-medium text-slate-800">{e.actor.name}</p>
                      <p className="text-xs text-slate-500">{e.actor.role}</p>
                    </TD>
                    <TD className="max-w-[160px] truncate font-mono text-xs text-slate-500">{e.target ?? "—"}</TD>
                    <TD className="max-w-xs truncate text-xs text-slate-500">
                      {Object.entries(e.metadata)
                        .filter(([, v]) => v !== null && v !== "")
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(" · ")}
                    </TD>
                    <TD className="tabular text-xs text-slate-500">{e.ipMasked}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <Pagination page={logs.data.page} totalPages={logs.data.totalPages} total={logs.data.total} pageSize={logs.data.pageSize} onChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
