"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Search, ShieldAlert, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { AccountStatusBadge, DemoBadge, accountStatusLabel } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { DescriptionList, Pagination, Table, Tabs, TD, TH, THead, TR } from "@/components/ui/data";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/form";
import { ConfirmDialog, Sheet } from "@/components/ui/modal";
import { Avatar } from "@/components/ui/popover";
import { invalidate, useApi } from "@/hooks/use-api";
import { api } from "@/services";
import { useI18n } from "@/hooks/use-i18n";
import { toApiError } from "@/services/errors";
import { ROLE_LABEL } from "@/lib/auth/access";
import { formatDate, formatMoney, formatRelative } from "@/lib/utils";
import type { AccountStatus, Role } from "@/types/domain";
import { DocumentList, StatusTimeline } from "../shared/verification";

type RoleTab = Role | "ALL";
const STATUSES: AccountStatus[] = ["VERIFIED", "PENDING_VERIFICATION", "APPLICATION_SUBMITTED", "PENDING", "UNDER_REVIEW", "REJECTED", "SUSPENDED"];

export function AdminUsers() {
  const { t, lang } = useI18n();
  const [role, setRole] = useState<RoleTab>("ALL");
  const [status, setStatus] = useState<AccountStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const list = useApi(() => api.admin.users({ role, status, search: debounced, page, pageSize: 10 }), [role, status, debounced, page], { tags: ["admin"] });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t("Admin")} title={t("Users")} description={t("Customers, agents and merchants. Select a user to review details or change account status.")} />
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center">
          <Tabs<RoleTab>
            ariaLabel={t("Filter by role")}
            value={role}
            onChange={(r) => { setRole(r); setPage(1); }}
            tabs={[
              { value: "ALL", label: t("All") },
              { value: "PERSONAL", label: t("Personal") },
              { value: "AGENT", label: t("Agents") },
              { value: "MERCHANT", label: t("Merchants") },
            ]}
            className="inline-flex"
          />
          <div className="flex flex-1 flex-col gap-3 sm:flex-row lg:justify-end">
            <div className="sm:w-72">
              <Input aria-label={t("Search users")} placeholder={t("Name, business, email or phone")} leading={<Search className="h-4 w-4" />} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <Select aria-label={t("Status")} value={status} onChange={(e) => { setStatus(e.target.value as AccountStatus | "ALL"); setPage(1); }} className="sm:w-52">
              <option value="ALL">{t("All statuses")}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(accountStatusLabel(s))}
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
          <EmptyState icon={<Users className="h-6 w-6" />} title={t("No users match")} />
        ) : (
          <>
            <Table>
              <THead>
                <TH>{t("User")}</TH>
                <TH>{t("Role")}</TH>
                <TH>{t("Phone")}</TH>
                <TH>{t("Status")}</TH>
                <TH>{t("Joined")}</TH>
                <TH>{t("Last sign-in")}</TH>
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
                    <TD className="text-slate-600">{t(ROLE_LABEL[u.role])}</TD>
                    <TD className="tabular text-slate-600">{u.phoneMasked}</TD>
                    <TD>
                      <AccountStatusBadge status={u.status} />
                    </TD>
                    <TD className="whitespace-nowrap text-slate-500">{formatDate(u.createdAt, lang)}</TD>
                    <TD className="whitespace-nowrap text-slate-500">{u.lastLoginAt ? formatRelative(u.lastLoginAt, lang) : t("Never")}</TD>
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
  const { t, lang } = useI18n();
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
      title={loaded ? u.businessName ?? u.name : t("User")}
      description={loaded ? `${t("{role} account", { role: t(ROLE_LABEL[u.role]) })} · ${u.phoneMasked}` : undefined}
      footer={
        loaded && (
          <>
            {u.role === "PERSONAL" && u.status === "PENDING_VERIFICATION" && (
              <Button variant="outline" onClick={() => setConfirm("KYC")}>
                <BadgeCheck className="h-4 w-4" aria-hidden /> {t("Approve KYC")}
              </Button>
            )}
            {u.status === "SUSPENDED" ? (
              <Button onClick={() => setConfirm("REACTIVATE")}>
                <ShieldCheck className="h-4 w-4" aria-hidden /> {t("Reactivate")}
              </Button>
            ) : (
              <Button variant="danger" onClick={() => setConfirm("SUSPEND")}>
                <ShieldAlert className="h-4 w-4" aria-hidden /> {t("Suspend account")}
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
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{t("Account")}</h3>
            <DescriptionList
              items={[
                { label: t("Name"), value: u.name },
                ...(u.businessName ? [{ label: u.role === "AGENT" ? t("Outlet") : t("Business"), value: u.businessName }] : []),
                { label: t("Phone"), value: u.phoneMasked },
                { label: t("Email"), value: u.email ?? "—" },
                { label: t("NID"), value: u.profile.nidMasked ?? "—" },
                { label: t("Joined"), value: formatDate(u.createdAt, lang) },
                { label: t("Transactions"), value: String(u.transactionCount) },
              ]}
            />
          </section>
          {u.wallet && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{t("Wallet (read-only)")}</h3>
              <DescriptionList
                items={[
                  { label: t("Available"), value: formatMoney(u.wallet.available) },
                  { label: t("Pending"), value: formatMoney(u.wallet.pending) },
                  ...(u.wallet.cashInHand !== null ? [{ label: t("Cash in hand"), value: formatMoney(u.wallet.cashInHand) }] : []),
                ]}
              />
              <p className="mt-2 text-xs text-slate-400">{t("Admins can't edit balances. Corrections are made with ledger adjustments in the back office.")}</p>
            </section>
          )}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{t("Documents")}</h3>
            <DocumentList documents={u.profile.documents} />
          </section>
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">{t("Status history")}</h3>
            <StatusTimeline events={u.profile.timeline} />
          </section>
        </div>
      )}
      <ConfirmDialog
        open={confirm === "SUSPEND" || confirm === "REACTIVATE"}
        onClose={() => setConfirm(null)}
        title={confirm === "SUSPEND" ? t("Suspend this account?") : t("Reactivate this account?")}
        description={confirm === "SUSPEND" ? t("All active sessions are ended immediately and the user can't sign in or transact until reactivated.") : t("The account returns to its previous verification status.")}
        confirmLabel={confirm === "SUSPEND" ? t("Suspend") : t("Reactivate")}
        tone={confirm === "SUSPEND" ? "danger" : "default"}
        reason={{ label: t("Reason"), placeholder: confirm === "SUSPEND" ? t("e.g. Suspicious activity reported") : t("e.g. Investigation closed") }}
        onConfirm={async (reason) => {
          try {
            await api.admin.setUserStatus(userId!, confirm as "SUSPEND" | "REACTIVATE", reason);
            done(confirm === "SUSPEND" ? t("Account suspended") : t("Account reactivated"));
          } catch (e) {
            toast.error(toApiError(e).message);
            throw e;
          }
        }}
      />
      <ConfirmDialog
        open={confirm === "KYC"}
        onClose={() => setConfirm(null)}
        title={t("Approve customer KYC?")}
        description={t("The customer moves to Verified and gets full transaction limits.")}
        confirmLabel={t("Approve")}
        onConfirm={async () => {
          try {
            await api.admin.decideVerification(userId!, "APPROVE", "KYC approved by reviewer");
            done(t("Customer verified"));
          } catch (e) {
            toast.error(toApiError(e).message);
            throw e;
          }
        }}
      />
    </Sheet>
  );
}
