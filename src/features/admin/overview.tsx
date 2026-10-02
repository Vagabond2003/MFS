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
import { formatCount, formatMoney, formatRelative } from "@/lib/utils";

export function AdminOverview() {
  const stats = useApi(() => api.admin.stats(), [], { tags: ["admin"], pollMs: 30_000 });
  const queue = useApi(() => api.admin.verificationQueue({ role: "ALL" }), [], { tags: ["admin"] });
  const audit = useApi(() => api.admin.auditLogs({ page: 1, pageSize: 8 }), [], { tags: ["admin"] });
  const s = stats.data;

  if (stats.error && !s) return <ErrorState message={stats.error.message} onRetry={stats.reload} />;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="System overview" description="Platform health, pending reviews and recent activity." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total customers" value={s ? formatCount(s.users.total) : "—"} icon={<Users className="h-4 w-4" />} hint={s ? `${s.users.suspended} suspended` : undefined} />
        <StatTile label="Pending verifications" value={s ? String(s.pendingVerifications.agents + s.pendingVerifications.merchants) : "—"} icon={<BadgeCheck className="h-4 w-4" />} hint={s ? `${s.pendingVerifications.agents} agents · ${s.pendingVerifications.merchants} merchants` : undefined} />
        <StatTile label="Today's volume" value={s ? formatMoney(s.today.volume) : "—"} icon={<TrendingUp className="h-4 w-4" />} hint={s ? `${formatCount(s.today.count)} transactions · ${s.today.failed} failed` : undefined} />
        <StatTile label="Open disputes" value={s ? String(s.openDisputes) : "—"} icon={<Gavel className="h-4 w-4" />} hint="Open or investigating" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Personal" value={s ? String(s.users.personal) : "—"} icon={<UserRound className="h-4 w-4" />} />
        <StatTile label="Agents" value={s ? String(s.users.agents) : "—"} icon={<BriefcaseBusiness className="h-4 w-4" />} />
        <StatTile label="Merchants" value={s ? String(s.users.merchants) : "—"} icon={<Store className="h-4 w-4" />} />
        <StatTile label="Month volume" value={s ? formatMoney(s.month.volume, { whole: true }) : "—"} icon={<Receipt className="h-4 w-4" />} />
        <StatTile label="Fees today" value={s ? formatMoney(s.today.fees) : "—"} icon={<Coins className="h-4 w-4" />} className="col-span-2 lg:col-span-1" />
      </div>

      {s ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <ChartCard title="Daily transaction volume" description="All successful transactions · last 14 days" xKey="date" data={s.daily} series={[{ key: "volume", label: "Volume" }]} refreshing={stats.refreshing}>
            <ColumnChart data={s.daily} xKey="date" series={[{ key: "volume", label: "Volume" }]} />
          </ChartCard>
          <DonutCard title="Volume by type" description="Last 30 days" centerLabel="volume" data={s.byType.map((t) => ({ label: TXN_META[t.type].label, value: t.volume }))} />
        </div>
      ) : (
        <Skeleton className="h-80 rounded-2xl" />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Verification queue"
            description="Agent & merchant applications awaiting a decision"
            action={
              <Link href="/admin/verifications" className="inline-flex items-center gap-1 text-sm font-semibold text-accent-700 hover:underline">
                Review <ArrowRight className="h-4 w-4" aria-hidden />
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
                          {a.role === "AGENT" ? "Agent" : "Merchant"} · {a.applicantName} · submitted {formatRelative(a.submittedAt)}
                        </p>
                      </div>
                      <AccountStatusBadge status={a.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<BadgeCheck className="h-6 w-6" />} title="Queue is clear" description="No applications are waiting for review." />
            )}
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Recent audit events"
            action={
              <Link href="/admin/audit-logs" className="inline-flex items-center gap-1 text-sm font-semibold text-accent-700 hover:underline">
                All logs <ArrowRight className="h-4 w-4" aria-hidden />
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
                <span className="shrink-0 text-xs text-slate-400">{formatRelative(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
