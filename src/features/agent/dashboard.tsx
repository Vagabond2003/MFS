"use client";

import Link from "next/link";
import {
  ArrowDownToLine,
  Banknote,
  CircleDollarSign,
  FileClock,
  Hourglass,
  Landmark,
  LockKeyhole,
  Percent,
  ReceiptText,
  Smartphone,
  Wallet,
} from "lucide-react";
import { ChartCard, ColumnChart, TrendChart } from "@/components/charts/charts";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatTile } from "@/components/ui/data";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { TransactionHistory } from "@/components/transactions/transaction-history";
import { useApi } from "@/hooks/use-api";
import { useCurrentUser } from "@/hooks/use-auth";
import { api } from "@/services";
import { cn, formatCount, formatMoney } from "@/lib/utils";
import { VerificationProgress } from "../shared/verification";

const COUNTER = [
  { href: "/dashboard/agent/cash-in", label: "Cash In", hint: "Customer deposits cash", icon: ArrowDownToLine, locked: true },
  { href: "/dashboard/agent/cash-out", label: "Cash Out", hint: "Customer withdraws cash", icon: Banknote, locked: true },
  { href: "/dashboard/agent/recharge", label: "Mobile Recharge", hint: "Top up any operator", icon: Smartphone, locked: true },
  { href: "/dashboard/agent/customer-payment", label: "Customer Payment", hint: "Pay bills for walk-ins", icon: ReceiptText, locked: true },
  { href: "/transactions", label: "Transaction History", hint: "Search & filter", icon: FileClock, locked: false },
  { href: "/dashboard/agent/settlement", label: "Settlement", hint: "Bank & float", icon: Landmark, locked: true },
];

export function AgentDashboardView() {
  const user = useCurrentUser();
  const dash = useApi(() => api.agent.dashboard(), [], { tags: ["dashboard", "wallet", "transactions"] });
  const d = dash.data;
  const verified = user.status === "VERIFIED";

  if (dash.error && !d) return <ErrorState message={dash.error.message} onRetry={dash.reload} />;

  const liquidity = d ? d.wallet.available + (d.wallet.cashInHand ?? 0) : 0;
  const emoneyShare = d && liquidity ? (d.wallet.available / liquidity) * 100 : 50;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-700">Agent console</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">{user.outletName}</h1>
          <p className="tabular text-sm text-slate-500">
            {user.agentCode} · {user.name}
          </p>
        </div>
      </div>

      {!verified && (
        <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
            <div className="flex flex-1 items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
                <LockKeyhole className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h2 className="font-semibold text-slate-900">Agent operations are locked</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Cash In, Cash Out, Recharge, Customer Payment and Settlement unlock once an administrator verifies your application. The server rejects these operations until then.
                </p>
              </div>
            </div>
            <div className="w-full lg:w-[380px]">
              <VerificationProgress track="AGENT" status={user.status} />
              <ButtonLink href="/dashboard/agent/verification" variant="outline" size="sm" className="mt-4">
                View application
              </ButtonLink>
            </div>
          </div>
        </Card>
      )}

      {/* Agent wallet */}
      <section aria-label="Agent wallet" className="rounded-3xl bg-slate-950 p-5 text-white sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Agent wallet</h2>
          <span className="text-xs text-slate-500">Updated live from the ledger</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <StatTile tone="dark" label="Current balance (e-money)" value={d ? formatMoney(d.wallet.available) : <Skeleton className="h-7 w-32 bg-white/10" />} icon={<Wallet className="h-4 w-4" />} />
          <StatTile tone="dark" label="Available cash" value={d ? formatMoney(d.wallet.cashInHand ?? 0) : <Skeleton className="h-7 w-32 bg-white/10" />} icon={<Banknote className="h-4 w-4" />} />
          <StatTile tone="dark" label="Pending settlement" value={d ? formatMoney(d.wallet.pending) : <Skeleton className="h-7 w-32 bg-white/10" />} icon={<Hourglass className="h-4 w-4" />} />
        </div>
        {d && liquidity > 0 && (
          <div className="mt-5">
            <div className="flex justify-between text-xs text-slate-400">
              <span>E-money {emoneyShare.toFixed(0)}%</span>
              <span>Cash {(100 - emoneyShare).toFixed(0)}%</span>
            </div>
            <div className="mt-1.5 flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`Float split: ${emoneyShare.toFixed(0)}% e-money, ${(100 - emoneyShare).toFixed(0)}% cash`}>
              <div className="rounded-l-full bg-accent-500" style={{ width: `${emoneyShare}%` }} />
              <div className="flex-1 rounded-r-full bg-slate-600" />
            </div>
            {(emoneyShare < 20 || emoneyShare > 80) && (
              <p className="mt-2 text-xs text-amber-300">Float is unbalanced — consider a {emoneyShare < 20 ? "float top-up" : "settlement to bank"}.</p>
            )}
          </div>
        )}
      </section>

      {/* Counter actions */}
      <section aria-label="Agent quick actions">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Counter</h2>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {COUNTER.map(({ href, label, hint, icon: Icon, locked }) => {
            const disabled = locked && !verified;
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-disabled={disabled}
                  className={cn(
                    "group relative flex h-full flex-col rounded-2xl border bg-white p-4 shadow-card transition",
                    disabled ? "border-slate-200 opacity-60" : "border-slate-200/80 hover:-translate-y-0.5 hover:border-accent-500 hover:shadow-lg",
                  )}
                >
                  <span className={cn("grid h-11 w-11 place-items-center rounded-xl", disabled ? "bg-slate-100 text-slate-400" : "bg-accent-500 text-accent-fg")}>
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="mt-3 text-sm font-bold text-slate-900">{label}</span>
                  <span className="text-xs text-slate-500">{hint}</span>
                  {disabled && <LockKeyhole className="absolute right-3 top-3 h-4 w-4 text-slate-400" aria-label="Locked until verified" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Today & month */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <section aria-label="Today's activity">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Today&apos;s activity</h2>
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Today's cash in" value={d ? formatMoney(d.today.cashIn) : "—"} icon={<ArrowDownToLine className="h-4 w-4" />} />
            <StatTile label="Today's cash out" value={d ? formatMoney(d.today.cashOut) : "—"} icon={<Banknote className="h-4 w-4" />} />
            <StatTile label="Today's recharge" value={d ? formatMoney(d.today.recharge) : "—"} icon={<Smartphone className="h-4 w-4" />} />
            <StatTile label="Today's commission" value={d ? formatMoney(d.today.commission) : "—"} icon={<Percent className="h-4 w-4" />} hint={d ? `${d.today.count} transactions today` : undefined} />
          </div>
        </section>
        <section aria-label="Monthly performance">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">This month</h2>
          <Card className="grid grid-cols-2 divide-slate-100 sm:grid-cols-3 sm:divide-x">
            {[
              ["Total cash in", d ? formatMoney(d.month.cashIn) : "—"],
              ["Total cash out", d ? formatMoney(d.month.cashOut) : "—"],
              ["Total recharge", d ? formatMoney(d.month.recharge) : "—"],
              ["Total transactions", d ? formatCount(d.month.transactionCount) : "—"],
              ["Commission earned", d ? formatMoney(d.month.commission) : "—"],
            ].map(([label, value], i) => (
              <div key={label} className={cn("px-5 py-4", i >= 3 && "border-t border-slate-100", i === 4 && "col-span-2 sm:col-span-2")}>
                <p className="text-xs font-medium text-slate-500">{label}</p>
                <p className={cn("tabular mt-1 text-lg font-bold", i === 4 ? "text-accent-700" : "text-slate-900")}>{value}</p>
              </div>
            ))}
          </Card>
        </section>
      </div>

      {/* Charts */}
      {d ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard
            className="lg:col-span-2"
            title="Daily cash in vs cash out"
            description="Last 14 days"
            xKey="date"
            data={d.daily}
            series={[{ key: "cashIn", label: "Cash in" }, { key: "cashOut", label: "Cash out" }]}
            refreshing={dash.refreshing}
          >
            <ColumnChart data={d.daily} xKey="date" series={[{ key: "cashIn", label: "Cash in" }, { key: "cashOut", label: "Cash out" }]} />
          </ChartCard>
          <ChartCard title="Monthly transaction volume" description="Cash in + cash out + recharge + payments" xKey="month" data={d.monthly} series={[{ key: "volume", label: "Volume" }]} refreshing={dash.refreshing}>
            <ColumnChart data={d.monthly} xKey="month" series={[{ key: "volume", label: "Volume" }]} />
          </ChartCard>
          <ChartCard title="Monthly commission" description="Earned across all services" xKey="month" data={d.monthly} series={[{ key: "commission", label: "Commission" }]} refreshing={dash.refreshing}>
            <TrendChart data={d.monthly} xKey="month" series={[{ key: "commission", label: "Commission" }]} />
          </ChartCard>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      )}

      <section aria-label="Recent agent transactions">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Recent agent transactions</h2>
          <Link href="/transactions" className="flex items-center gap-1 text-sm font-semibold text-accent-700 hover:underline">
            <CircleDollarSign className="h-4 w-4" aria-hidden /> Full history
          </Link>
        </div>
        <TransactionHistory role="AGENT" variant="agent" pageSize={8} />
      </section>
    </div>
  );
}
