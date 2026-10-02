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
import { toApiError } from "@/services/errors";
import { ROLE_LABEL } from "@/lib/auth/access";
import { formatDateTime, formatMoney, formatRelative } from "@/lib/utils";
import type { DisputeStatus, DisputeView } from "@/types/domain";

/* ───────────── Transactions ───────────── */

export function AdminTransactions() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Transactions" description="Every transaction on the platform. Party details are masked; full records are available to compliance via the back office." />
      <TransactionHistory role="ADMIN" variant="admin" fetcher={api.admin.transactions} pageSize={15} />
    </div>
  );
}

/* ───────────── Disputes ───────────── */

export function AdminDisputes() {
  const [status, setStatus] = useState<DisputeStatus | "ALL">("ALL");
  const [selected, setSelected] = useState<DisputeView | null>(null);
  const list = useApi(() => api.admin.disputes({ status }), [status], { tags: ["admin"] });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Disputes" description="Customer-reported problems with transactions." />
      <Card>
        <div className="border-b border-slate-100 p-4">
          <Tabs<DisputeStatus | "ALL">
            ariaLabel="Dispute status"
            value={status}
            onChange={setStatus}
            tabs={[
              { value: "ALL", label: "All" },
              { value: "OPEN", label: "Open" },
              { value: "INVESTIGATING", label: "Investigating" },
              { value: "RESOLVED", label: "Resolved" },
              { value: "REJECTED", label: "Rejected" },
            ]}
            className="inline-flex max-w-full"
          />
        </div>
        {list.error ? (
          <ErrorState message={list.error.message} onRetry={list.reload} />
        ) : list.loading ? (
          <Skeleton className="m-6 h-40" />
        ) : !list.data?.length ? (
          <EmptyState icon={<Gavel className="h-6 w-6" />} title="No disputes" />
        ) : (
          <Table>
            <THead>
              <TH>Transaction</TH>
              <TH>Raised by</TH>
              <TH>Reason</TH>
              <TH align="right">Amount</TH>
              <TH>Opened</TH>
              <TH>Status</TH>
            </THead>
            <tbody>
              {list.data.map((d) => (
                <TR key={d.id} onClick={() => setSelected(d)}>
                  <TD className="tabular font-mono text-xs">{d.trxId}</TD>
                  <TD>
                    <p className="font-medium text-slate-900">{d.raisedBy.name}</p>
                    <p className="text-xs text-slate-500">{ROLE_LABEL[d.raisedBy.role]}</p>
                  </TD>
                  <TD className="max-w-xs truncate text-slate-600">{d.reason}</TD>
                  <TD align="right" className="tabular font-semibold">
                    {formatMoney(d.amount)}
                  </TD>
                  <TD className="whitespace-nowrap text-slate-500">{formatRelative(d.createdAt)}</TD>
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
  return (
    <Sheet open={!!dispute} onClose={onClose} title="Dispute" description={dispute ? `Transaction ${dispute.trxId}` : undefined}>
      {dispute && <DisputeForm key={dispute.id} dispute={dispute} onClose={onClose} onChanged={onChanged} />}
    </Sheet>
  );
}

function DisputeForm({ dispute, onClose, onChanged }: { dispute: DisputeView; onClose: () => void; onChanged: () => void }) {
  const [status, setStatus] = useState<DisputeStatus>(dispute.status);
  const [resolution, setResolution] = useState(dispute.resolution ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.admin.updateDispute(dispute.id, status, resolution);
      toast.success("Dispute updated and customer notified");
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
          { label: "Status", value: <DisputeStatusBadge status={dispute.status} /> },
          { label: "Raised by", value: `${dispute.raisedBy.name} (${ROLE_LABEL[dispute.raisedBy.role]})` },
          { label: "Amount", value: formatMoney(dispute.amount) },
          { label: "Opened", value: formatDateTime(dispute.createdAt) },
          { label: "Last update", value: formatDateTime(dispute.updatedAt) },
        ]}
      />
      <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Customer&apos;s description</p>
        {dispute.reason}
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-700">Update status</p>
        <ChoiceChips<DisputeStatus>
          ariaLabel="Dispute status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "OPEN", label: "Open" },
            { value: "INVESTIGATING", label: "Investigating" },
            { value: "RESOLVED", label: "Resolved" },
            { value: "REJECTED", label: "Rejected" },
          ]}
        />
      </div>
      <Field label="Resolution note" hint="Required when resolving or rejecting. Sent to the customer.">
        {(p) => <Textarea {...p} rows={4} value={resolution} onChange={(e) => setResolution(e.target.value)} />}
      </Field>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button variant="outline" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={save} loading={busy}>
          Save & notify customer
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
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [action, setAction] = useState("ALL");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const logs = useApi(() => api.admin.auditLogs({ search: debounced, action, page, pageSize: 20 }), [debounced, action, page], { tags: ["admin"] });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Audit logs" description="Append-only record of sign-ins, money movement and administrative actions." />
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
          <div className="flex-1">
            <Input aria-label="Search audit logs" placeholder="Search action, actor or target" leading={<Search className="h-4 w-4" />} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <select
            aria-label="Action"
            value={action}
            onChange={(e) => { setAction(e.target.value); setPage(1); }}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm sm:w-64"
          >
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a === "ALL" ? "All actions" : a}
              </option>
            ))}
          </select>
        </div>
        {logs.error ? (
          <ErrorState message={logs.error.message} onRetry={logs.reload} />
        ) : logs.loading ? (
          <Skeleton className="m-6 h-64" />
        ) : !logs.data?.items.length ? (
          <EmptyState icon={<ScrollText className="h-6 w-6" />} title="No matching events" />
        ) : (
          <>
            <Table>
              <THead>
                <TH>When</TH>
                <TH>Action</TH>
                <TH>Actor</TH>
                <TH>Target</TH>
                <TH>Details</TH>
                <TH>IP</TH>
              </THead>
              <tbody>
                {logs.data.items.map((e) => (
                  <TR key={e.id}>
                    <TD className="whitespace-nowrap text-slate-500">{formatDateTime(e.createdAt)}</TD>
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
