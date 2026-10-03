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
import { useI18n } from "@/hooks/use-i18n";
import { msg } from "@/lib/i18n/core";
import { api } from "@/services";
import { cn, formatCount, formatMoney } from "@/lib/utils";
import { LiquidityCard } from "../insights/agent";
import { VerificationProgress } from "../shared/verification";

const COUNTER = [
  { href: "/dashboard/agent/cash-in", label: msg("Cash In"), hint: msg("Customer deposits cash"), icon: ArrowDownToLine, locked: true },
  { href: "/dashboard/agent/cash-out", label: msg("Cash Out"), hint: msg("Customer withdraws cash"), icon: Banknote, locked: true },
  { href: "/dashboard/agent/recharge", label: msg("Mobile Recharge"), hint: msg("Top up any operator"), icon: Smartphone, locked: true },
  { href: "/dashboard/agent/customer-payment", label: msg("Customer Payment"), hint: msg("Pay bills for walk-ins"), icon: ReceiptText, locked: true },
  { href: "/transactions", label: msg("Transaction History"), hint: msg("Search & filter"), icon: FileClock, locked: false },
  { href: "/dashboard/agent/settlement", label: msg("Settlement"), hint: msg("Bank & float"), icon: Landmark, locked: true },
];

export function AgentDashboardView() {
  const { t } = useI18n();
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
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-700">{t("Agent console")}</p>
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
                <h2 className="font-semibold text-slate-900">{t("Agent operations are locked")}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {t("Cash In, Cash Out, Recharge, Customer Payment and Settlement unlock once an administrator verifies your application. The server rejects these operations until then.")}
                </p>
              </div>
            </div>
            <div className="w-full lg:w-[380px]">
              <VerificationProgress track="AGENT" status={user.status} />
              <ButtonLink href="/dashboard/agent/verification" variant="outline" size="sm" className="mt-4">
                {t("View application")}
              </ButtonLink>
            </div>
          </div>
        </Card>
      )}

      {/* Agent wallet */}
      <section aria-label={t("Agent wallet")} className="rounded-3xl bg-slate-950 p-5 text-white sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">{t("Agent wallet")}</h2>
          <span className="text-xs text-slate-500">{t("Updated live from the ledger")}</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <StatTile tone="dark" label={t("Current balance (e-money)")} value={d ? formatMoney(d.wallet.available) : <Skeleton className="h-7 w-32 bg-white/10" />} icon={<Wallet className="h-4 w-4" />} />
          <StatTile tone="dark" label={t("Available cash")} value={d ? formatMoney(d.wallet.cashInHand ?? 0) : <Skeleton className="h-7 w-32 bg-white/10" />} icon={<Banknote className="h-4 w-4" />} />
          <StatTile tone="dark" label={t("Pending settlement")} value={d ? formatMoney(d.wallet.pending) : <Skeleton className="h-7 w-32 bg-white/10" />} icon={<Hourglass className="h-4 w-4" />} />
        </div>
        {d && liquidity > 0 && (
          <div className="mt-5">
            <div className="flex justify-between text-xs text-slate-400">
              <span>{t("E-money")} {emoneyShare.toFixed(0)}%</span>
              <span>{t("Cash")} {(100 - emoneyShare).toFixed(0)}%</span>
            </div>
            <div className="mt-1.5 flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={t("Float split: {emoney}% e-money, {cash}% cash", { emoney: emoneyShare.toFixed(0), cash: (100 - emoneyShare).toFixed(0) })}>
              <div className="rounded-l-full bg-accent-500" style={{ width: `${emoneyShare}%` }} />
              <div className="flex-1 rounded-r-full bg-slate-600" />
            </div>
            {(emoneyShare < 20 || emoneyShare > 80) && (
              <p className="mt-2 text-xs text-amber-300">{emoneyShare < 20 ? t("Float is unbalanced — consider a float top-up.") : t("Float is unbalanced — consider a settlement to bank.")}</p>
            )}
          </div>
        )}
      </section>

      {verified && <LiquidityCard />}

      {/* Counter actions */}
      <section aria-label={t("Agent quick actions")}>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">{t("Counter")}</h2>
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
                  <span className="mt-3 text-sm font-bold text-slate-900">{t(label)}</span>
                  <span className="text-xs text-slate-500">{t(hint)}</span>
                  {disabled && <LockKeyhole className="absolute right-3 top-3 h-4 w-4 text-slate-400" aria-label={t("Locked until verified")} />}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Today & month */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <section aria-label={t("Today's activity")}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">{t("Today's activity")}</h2>
          <div className="grid grid-cols-2 gap-3">
            <StatTile label={t("Today's cash in")} value={d ? formatMoney(d.today.cashIn) : "—"} icon={<ArrowDownToLine className="h-4 w-4" />} />
            <StatTile label={t("Today's cash out")} value={d ? formatMoney(d.today.cashOut) : "—"} icon={<Banknote className="h-4 w-4" />} />
            <StatTile label={t("Today's recharge")} value={d ? formatMoney(d.today.recharge) : "—"} icon={<Smartphone className="h-4 w-4" />} />
            <StatTile label={t("Today's commission")} value={d ? formatMoney(d.today.commission) : "—"} icon={<Percent className="h-4 w-4" />} hint={d ? t("{n} transactions today", { n: d.today.count }) : undefined} />
          </div>
        </section>
        <section aria-label={t("Monthly performance")}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">{t("This month")}</h2>
          <Card className="grid grid-cols-2 divide-slate-100 sm:grid-cols-3 sm:divide-x">
            {[
              [t("Total cash in"), d ? formatMoney(d.month.cashIn) : "—"],
              [t("Total cash out"), d ? formatMoney(d.month.cashOut) : "—"],
              [t("Total recharge"), d ? formatMoney(d.month.recharge) : "—"],
              [t("Total transactions"), d ? formatCount(d.month.transactionCount) : "—"],
              [t("Commission earned"), d ? formatMoney(d.month.commission) : "—"],
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
            title={t("Daily cash in vs cash out")}
            description={t("Last 14 days")}
            xKey="date"
            data={d.daily}
            series={[{ key: "cashIn", label: t("Cash in") }, { key: "cashOut", label: t("Cash out") }]}
            refreshing={dash.refreshing}
          >
            <ColumnChart data={d.daily} xKey="date" series={[{ key: "cashIn", label: t("Cash in") }, { key: "cashOut", label: t("Cash out") }]} />
          </ChartCard>
          <ChartCard title={t("Monthly transaction volume")} description={t("Cash in + cash out + recharge + payments")} xKey="month" data={d.monthly} series={[{ key: "volume", label: t("Volume") }]} refreshing={dash.refreshing}>
            <ColumnChart data={d.monthly} xKey="month" series={[{ key: "volume", label: t("Volume") }]} />
          </ChartCard>
          <ChartCard title={t("Monthly commission")} description={t("Earned across all services")} xKey="month" data={d.monthly} series={[{ key: "commission", label: t("Commission") }]} refreshing={dash.refreshing}>
            <TrendChart data={d.monthly} xKey="month" series={[{ key: "commission", label: t("Commission") }]} />
          </ChartCard>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      )}

      <section aria-label={t("Recent agent transactions")}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">{t("Recent agent transactions")}</h2>
          <Link href="/transactions" className="flex items-center gap-1 text-sm font-semibold text-accent-700 hover:underline">
            <CircleDollarSign className="h-4 w-4" aria-hidden /> {t("Full history")}
          </Link>
        </div>
        <TransactionHistory role="AGENT" variant="agent" pageSize={8} />
      </section>
    </div>
  );
}
