"use client";

import Link from "next/link";
import { ArrowRight, BadgeCheck, Ban, BriefcaseBusiness, CircleX, Coins, Gavel, Receipt, Store, TrendingUp, UserRound, Users } from "lucide-react";
import { ChartCard, ColumnChart, DonutCard } from "@/components/charts/charts";
import { AccountStatusBadge } from "@/components/ui/badge";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { StatTile } from "@/components/ui/data";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { TXN_META } from "@/components/transactions/meta";
import { useApi } from "@/hooks/use-api";
import { api } from "@/services";
import { useI18n } from "@/hooks/use-i18n";
import { formatCount, formatMoney, formatRelative } from "@/lib/utils";

export function AdminOverview() {
  const { t, lang } = useI18n();
  const stats = useApi(() => api.admin.stats(), [], { tags: ["admin"], pollMs: 30_000 });
  const queue = useApi(() => api.admin.verificationQueue({ role: "ALL" }), [], { tags: ["admin"] });
  const audit = useApi(() => api.admin.auditLogs({ page: 1, pageSize: 8 }), [], { tags: ["admin"] });
  const s = stats.data;

  if (stats.error && !s) return <ErrorState message={stats.error.message} onRetry={stats.reload} />;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t("Admin")} title={t("System overview")} description={t("Platform health, pending reviews and recent activity.")} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={t("Total customers")} value={s ? formatCount(s.users.total) : "—"} icon={<Users className="h-4 w-4" />} hint={s ? t("{n} suspended", { n: s.users.suspended }) : undefined} />
        <StatTile label={t("Pending verifications")} value={s ? String(s.pendingVerifications.agents + s.pendingVerifications.merchants) : "—"} icon={<BadgeCheck className="h-4 w-4" />} hint={s ? t("{agents} agents · {merchants} merchants", { agents: s.pendingVerifications.agents, merchants: s.pendingVerifications.merchants }) : undefined} />
        <StatTile label={t("Today's volume")} value={s ? formatMoney(s.today.volume) : "—"} icon={<TrendingUp className="h-4 w-4" />} hint={s ? t("{n} transactions · {failed} failed", { n: formatCount(s.today.count), failed: s.today.failed }) : undefined} />
        <StatTile label={t("Open disputes")} value={s ? String(s.openDisputes) : "—"} icon={<Gavel className="h-4 w-4" />} hint={t("Open or investigating")} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label={t("Personal")} value={s ? String(s.users.personal) : "—"} icon={<UserRound className="h-4 w-4" />} />
        <StatTile label={t("Agents")} value={s ? String(s.users.agents) : "—"} icon={<BriefcaseBusiness className="h-4 w-4" />} />
        <StatTile label={t("Merchants")} value={s ? String(s.users.merchants) : "—"} icon={<Store className="h-4 w-4" />} />
        <StatTile label={t("Month volume")} value={s ? formatMoney(s.month.volume, { whole: true }) : "—"} icon={<Receipt className="h-4 w-4" />} />
        <StatTile label={t("Fees today")} value={s ? formatMoney(s.today.fees) : "—"} icon={<Coins className="h-4 w-4" />} className="col-span-2 lg:col-span-1" />
      </div>

      {s ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <ChartCard title={t("Daily transaction volume")} description={t("All successful transactions · last 14 days")} xKey="date" data={s.daily} series={[{ key: "volume", label: t("Volume") }]} refreshing={stats.refreshing}>
            <ColumnChart data={s.daily} xKey="date" series={[{ key: "volume", label: t("Volume") }]} />
          </ChartCard>
          <DonutCard title={t("Volume by type")} description={t("Last 30 days")} centerLabel={t("volume")} data={s.byType.map((row) => ({ label: TXN_META[row.type].label, value: row.volume }))} />
        </div>
      ) : (
        <Skeleton className="h-80 rounded-2xl" />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={t("Verification queue")}
            description={t("Agent & merchant applications awaiting a decision")}
            action={
              <Link href="/admin/verifications" className="inline-flex items-center gap-1 text-sm font-semibold text-accent-700 hover:underline">
                {t("Review")} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            }
          />
          <div className="mt-3">
            {queue.data?.length ? (
              <ul className="divide-y divide-slate-100">
                {queue.data.slice(0, 5).map((a) => (
                  <li key={a.userId}>
                    <Link href={`/admin/verifications?user=${a.userId}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 sm:px-6">
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-500">
                        {a.role === "AGENT" ? <BriefcaseBusiness className="h-4 w-4" aria-hidden /> : <Store className="h-4 w-4" aria-hidden />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{a.businessName ?? a.applicantName}</p>
                        <p className="text-xs text-slate-500">
                          {a.role === "AGENT" ? t("Agent") : t("Merchant")} · {a.applicantName} · {t("submitted {when}", { when: formatRelative(a.submittedAt, lang) })}
                        </p>
                      </div>
                      <AccountStatusBadge status={a.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<BadgeCheck className="h-6 w-6" />} title={t("Queue is clear")} description={t("No applications are waiting for review.")} />
            )}
          </div>
        </Card>
        <Card>
          <CardHeader
            title={t("Recent audit events")}
            action={
              <Link href="/admin/audit-logs" className="inline-flex items-center gap-1 text-sm font-semibold text-accent-700 hover:underline">
                {t("All logs")} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            }
          />
          <ul className="mt-3 divide-y divide-slate-100">
            {audit.data?.items.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-5 py-2.5 sm:px-6">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-slate-500">
                  {e.action.includes("FAILED") || e.action.includes("SUSPEND") ? <CircleX className="h-3.5 w-3.5 text-rose-500" aria-hidden /> : e.action.includes("BLOCK") ? <Ban className="h-3.5 w-3.5" aria-hidden /> : <Receipt className="h-3.5 w-3.5" aria-hidden />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs font-semibold text-slate-800">{e.action}</p>
                  <p className="truncate text-xs text-slate-500">{e.actor.name}</p>
                </div>
                <span className="shrink-0 text-xs text-slate-400">{formatRelative(e.createdAt, lang)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
