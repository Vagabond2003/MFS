"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Search, ShieldAlert, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { AccountStatusBadge, DemoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { DescriptionList, Pagination, Table, Tabs, TD, TH, THead, TR } from "@/components/ui/data";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/form";
import { ConfirmDialog, Sheet } from "@/components/ui/modal";
import { Avatar } from "@/components/ui/popover";
import { invalidate, useApi } from "@/hooks/use-api";
import { api } from "@/services";
import { toApiError } from "@/services/errors";
import { ROLE_LABEL } from "@/lib/auth/access";
import { formatDate, formatMoney, formatRelative } from "@/lib/utils";
import type { AccountStatus, Role } from "@/types/domain";
import { DocumentList, StatusTimeline } from "../shared/verification";

type RoleTab = Role | "ALL";
const STATUSES: AccountStatus[] = ["VERIFIED", "PENDING_VERIFICATION", "APPLICATION_SUBMITTED", "PENDING", "UNDER_REVIEW", "REJECTED", "SUSPENDED"];

export function AdminUsers() {
  const [role, setRole] = useState<RoleTab>("ALL");
  const [status, setStatus] = useState<AccountStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const list = useApi(() => api.admin.users({ role, status, search: debounced, page, pageSize: 10 }), [role, status, debounced, page], { tags: ["admin"] });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Users" description="Customers, agents and merchants. Select a user to review details or change account status." />
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center">
          <Tabs<RoleTab>
            ariaLabel="Filter by role"
            value={role}
            onChange={(r) => { setRole(r); setPage(1); }}
            tabs={[
              { value: "ALL", label: "All" },
              { value: "PERSONAL", label: "Personal" },
              { value: "AGENT", label: "Agents" },
              { value: "MERCHANT", label: "Merchants" },
            ]}
            className="inline-flex"
          />
          <div className="flex flex-1 flex-col gap-3 sm:flex-row lg:justify-end">
            <div className="sm:w-72">
              <Input aria-label="Search users" placeholder="Name, business, email or phone" leading={<Search className="h-4 w-4" />} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <Select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value as AccountStatus | "ALL"); setPage(1); }} className="sm:w-52">
              <option value="ALL">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ").toLowerCase()}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {list.error ? (
          <ErrorState message={list.error.message} onRetry={list.reload} />
        ) : list.loading ? (
          <Skeleton className="m-6 h-64" />
        ) : !list.data?.items.length ? (
          <EmptyState icon={<Users className="h-6 w-6" />} title="No users match" />
        ) : (
          <>
            <Table>
              <THead>
                <TH>User</TH>
                <TH>Role</TH>
                <TH>Phone</TH>
                <TH>Status</TH>
                <TH>Joined</TH>
                <TH>Last sign-in</TH>
              </THead>
              <tbody>
                {list.data.items.map((u) => (
                  <TR key={u.id} onClick={() => setSelected(u.id)}>
                    <TD>
                      <div className="flex items-center gap-3">
                        <Avatar name={u.businessName ?? u.name} className="h-8 w-8 text-xs" />
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 font-medium text-slate-900">
                            <span className="truncate">{u.businessName ?? u.name}</span> {u.isDemo && <DemoBadge />}
                          </p>
                          <p className="truncate text-xs text-slate-500">{u.businessName ? u.name : u.email ?? "—"}</p>
                        </div>
                      </div>
                    </TD>
                    <TD className="text-slate-600">{ROLE_LABEL[u.role]}</TD>
                    <TD className="tabular text-slate-600">{u.phoneMasked}</TD>
                    <TD>
                      <AccountStatusBadge status={u.status} />
                    </TD>
                    <TD className="whitespace-nowrap text-slate-500">{formatDate(u.createdAt)}</TD>
                    <TD className="whitespace-nowrap text-slate-500">{u.lastLoginAt ? formatRelative(u.lastLoginAt) : "Never"}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <Pagination page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} pageSize={list.data.pageSize} onChange={setPage} />
          </>
        )}
      </Card>
      <UserDrawer userId={selected} onClose={() => setSelected(null)} onChanged={list.reload} />
    </div>
  );
}

function UserDrawer({ userId, onClose, onChanged }: { userId: string | null; onClose: () => void; onChanged: () => void }) {
  const detail = useApi(() => api.admin.user(userId!), [userId], { enabled: !!userId });
  const [confirm, setConfirm] = useState<"SUSPEND" | "REACTIVATE" | "KYC" | null>(null);
  const u = userId ? detail.data : undefined;
  const loaded = u && u.id === userId;

  const done = (msg: string) => {
    toast.success(msg);
    detail.reload();
    onChanged();
    invalidate("admin");
  };

  return (
    <Sheet
      open={!!userId}
      onClose={onClose}
      title={loaded ? u.businessName ?? u.name : "User"}
      description={loaded ? `${ROLE_LABEL[u.role]} account · ${u.phoneMasked}` : undefined}
      footer={
        loaded && (
          <>
            {u.role === "PERSONAL" && u.status === "PENDING_VERIFICATION" && (
              <Button variant="outline" onClick={() => setConfirm("KYC")}>
                <BadgeCheck className="h-4 w-4" aria-hidden /> Approve KYC
              </Button>
            )}
            {u.status === "SUSPENDED" ? (
              <Button onClick={() => setConfirm("REACTIVATE")}>
                <ShieldCheck className="h-4 w-4" aria-hidden /> Reactivate
              </Button>
            ) : (
              <Button variant="danger" onClick={() => setConfirm("SUSPEND")}>
                <ShieldAlert className="h-4 w-4" aria-hidden /> Suspend account
              </Button>
            )}
          </>
        )
      }
    >
      {!loaded ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <AccountStatusBadge status={u.status} /> {u.isDemo && <DemoBadge />}
          </div>
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Account</h3>
            <DescriptionList
              items={[
                { label: "Name", value: u.name },
                ...(u.businessName ? [{ label: u.role === "AGENT" ? "Outlet" : "Business", value: u.businessName }] : []),
                { label: "Phone", value: u.phoneMasked },
                { label: "Email", value: u.email ?? "—" },
                { label: "NID", value: u.profile.nidMasked ?? "—" },
                { label: "Joined", value: formatDate(u.createdAt) },
                { label: "Transactions", value: String(u.transactionCount) },
              ]}
            />
          </section>
          {u.wallet && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Wallet (read-only)</h3>
              <DescriptionList
                items={[
                  { label: "Available", value: formatMoney(u.wallet.available) },
                  { label: "Pending", value: formatMoney(u.wallet.pending) },
                  ...(u.wallet.cashInHand !== null ? [{ label: "Cash in hand", value: formatMoney(u.wallet.cashInHand) }] : []),
                ]}
              />
              <p className="mt-2 text-xs text-slate-400">Admins can&apos;t edit balances. Corrections are made with ledger adjustments in the back office.</p>
            </section>
          )}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Documents</h3>
            <DocumentList documents={u.profile.documents} />
          </section>
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Status history</h3>
            <StatusTimeline events={u.profile.timeline} />
          </section>
        </div>
      )}
      <ConfirmDialog
        open={confirm === "SUSPEND" || confirm === "REACTIVATE"}
        onClose={() => setConfirm(null)}
        title={confirm === "SUSPEND" ? "Suspend this account?" : "Reactivate this account?"}
        description={confirm === "SUSPEND" ? "All active sessions are ended immediately and the user can't sign in or transact until reactivated." : "The account returns to its previous verification status."}
        confirmLabel={confirm === "SUSPEND" ? "Suspend" : "Reactivate"}
        tone={confirm === "SUSPEND" ? "danger" : "default"}
        reason={{ label: "Reason", placeholder: confirm === "SUSPEND" ? "e.g. Suspicious activity reported" : "e.g. Investigation closed" }}
        onConfirm={async (reason) => {
          try {
            await api.admin.setUserStatus(userId!, confirm as "SUSPEND" | "REACTIVATE", reason);
            done(confirm === "SUSPEND" ? "Account suspended" : "Account reactivated");
          } catch (e) {
            toast.error(toApiError(e).message);
            throw e;
          }
        }}
      />
      <ConfirmDialog
        open={confirm === "KYC"}
        onClose={() => setConfirm(null)}
        title="Approve customer KYC?"
        description="The customer moves to Verified and gets full transaction limits."
        confirmLabel="Approve"
        onConfirm={async () => {
          try {
            await api.admin.decideVerification(userId!, "APPROVE", "KYC approved by reviewer");
            done("Customer verified");
          } catch (e) {
            toast.error(toApiError(e).message);
            throw e;
          }
        }}
      />
    </Sheet>
  );
}
