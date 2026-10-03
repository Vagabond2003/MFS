"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  CirclePlus,
  Eye,
  EyeOff,
  PiggyBank,
  ReceiptText,
  Send,
  ShoppingBag,
  Smartphone,
  Store,
} from "lucide-react";
import { ChartCard, ColumnChart, DonutCard, TrendChart } from "@/components/charts/charts";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { StatTile } from "@/components/ui/data";
import { Alert, EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { TransactionDetail } from "@/components/transactions/transaction-detail";
import { TransactionTable } from "@/components/transactions/transaction-table";
import { useApi } from "@/hooks/use-api";
import { useCurrentUser } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { msg } from "@/lib/i18n/core";
import { api } from "@/services";
import { cn, formatMoney, formatPhone, greeting, percentChange } from "@/lib/utils";
import type { TransactionView } from "@/types/domain";

const QUICK = [
  { href: "/dashboard/personal/send", label: msg("Send Money"), icon: Send },
  { href: "/dashboard/personal/cash-out", label: msg("Cash Out"), icon: Banknote },
  { href: "/dashboard/personal/recharge", label: msg("Mobile Recharge"), icon: Smartphone },
  { href: "/dashboard/personal/pay-bill", label: msg("Pay Bill"), icon: ReceiptText },
  { href: "/dashboard/personal/merchant-pay", label: msg("Merchant Payment"), icon: Store },
  { href: "/dashboard/personal/add-money", label: msg("Add Money"), icon: CirclePlus },
];

export function PersonalDashboardView() {
  const { t } = useI18n();
  const user = useCurrentUser();
  const dash = useApi(() => api.personal.dashboard(), [], { tags: ["dashboard", "wallet", "transactions"] });
  const [hidden, setHidden] = useState(false);
  const [selected, setSelected] = useState<TransactionView | null>(null);
  const d = dash.data;

  if (dash.error && !d) return <ErrorState message={dash.error.message} onRetry={dash.reload} />;

  const money = (v: number) => (hidden ? "৳ ••••••" : formatMoney(v));
  const usedPct = d ? Math.min(100, (d.limits.usedToday / d.limits.dailyOut) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-500">{t(greeting())},</p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">{user.name.split(" ")[0]} 👋</h1>
      </div>

      {user.status === "PENDING_VERIFICATION" && (
        <Alert
          tone="warning"
          title={t("Your identity isn't verified yet")}
          action={
            <ButtonLink href="/profile" size="sm" variant="outline">
              {t("Verify now")}
            </ButtonLink>
          }
        >
          {t("Limits are ৳5,000 per transaction and ৳10,000 per day until you complete verification.")}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* Wallet card */}
        <section aria-label={t("Balance")} className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-800 via-brand-700 to-brand-500 p-6 text-white shadow-lg sm:p-7">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" aria-hidden />
          <div className="pointer-events-none absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-white/5" aria-hidden />
          <div className="relative flex items-start justify-between">
            <div>
              <p className="text-sm text-brand-100">{t("Available balance")}</p>
              {d ? (
                <p className="mt-1 text-4xl font-bold tracking-tight sm:text-5xl">{money(d.wallet.available)}</p>
              ) : (
                <Skeleton className="mt-2 h-11 w-56 bg-white/20" />
              )}
            </div>
            <button
              type="button"
              onClick={() => setHidden((h) => !h)}
              className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 transition hover:bg-white/25"
              aria-label={hidden ? t("Show balances") : t("Hide balances")}
              aria-pressed={hidden}
            >
              {hidden ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
            </button>
          </div>
          <div className="relative mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="flex items-center gap-1.5 text-xs text-brand-100">
                <PiggyBank className="h-3.5 w-3.5" aria-hidden /> {t("Savings balance")}
              </p>
              <p className="tabular mt-1 font-semibold">{d ? money(d.wallet.savings) : "—"}</p>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-xs text-brand-100">{t("Pending balance")}</p>
              <p className="tabular mt-1 font-semibold">{d ? money(d.wallet.pending) : "—"}</p>
            </div>
          </div>
          <div className="relative mt-5 flex items-center justify-between text-xs text-brand-100">
            <span className="tabular">{t("Wallet")} · {formatPhone(user.phone)}</span>
            <Link href="/dashboard/personal/add-money" className="inline-flex items-center gap-1 font-semibold text-white hover:underline">
              <CirclePlus className="h-3.5 w-3.5" aria-hidden /> {t("Add money")}
            </Link>
          </div>
        </section>

        {/* Quick actions */}
        <Card className="p-5 sm:p-6">
          <h2 className="text-[15px] font-semibold text-slate-900">{t("Quick actions")}</h2>
          <ul className="mt-4 grid grid-cols-3 gap-3">
            {QUICK.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link href={href} className="group flex flex-col items-center gap-2 rounded-2xl p-2 text-center transition hover:bg-slate-50">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-700 transition group-hover:bg-brand-600 group-hover:text-white">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="text-xs font-semibold text-slate-700">{t(label)}</span>
                </Link>
              </li>
            ))}
          </ul>
          {d && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">{t("Daily limit used")}</span>
                <span className="tabular font-semibold text-slate-700">
                  {t("{used} of {limit}", { used: formatMoney(d.limits.usedToday, { whole: true }), limit: formatMoney(d.limits.dailyOut, { whole: true }) })}
                </span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-brand-100" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(usedPct)} aria-label={t("Daily limit used")}>
                <div className={cn("h-2 rounded-full", usedPct > 85 ? "bg-rose-500" : usedPct > 60 ? "bg-amber-500" : "bg-brand-600")} style={{ width: `${usedPct}%` }} />
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Financial summary */}
      <section aria-label={t("This month")}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">{t("This month")}</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {d ? (
            <>
              <StatTile deltaLabel={t("vs same days last month")} label={t("Total sent")} value={money(d.month.sent)} icon={<ArrowUpRight className="h-4 w-4" />} delta={percentChange(d.month.sent, d.previousMonth.sent)} upIsGood={false} />
              <StatTile deltaLabel={t("vs same days last month")} label={t("Total received")} value={money(d.month.received)} icon={<ArrowDownLeft className="h-4 w-4" />} delta={percentChange(d.month.received, d.previousMonth.received)} />
              <StatTile deltaLabel={t("vs same days last month")} label={t("Total spent")} value={money(d.month.spent)} icon={<ShoppingBag className="h-4 w-4" />} delta={percentChange(d.month.spent, d.previousMonth.spent)} upIsGood={false} />
              <StatTile deltaLabel={t("vs same days last month")} label={t("Total saved")} value={money(d.month.saved)} icon={<PiggyBank className="h-4 w-4" />} delta={percentChange(d.month.saved, d.previousMonth.saved)} />
            </>
          ) : (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[108px] rounded-2xl" />)
          )}
        </div>
      </section>

      {/* Monthly overview */}
      <Card>
        <CardHeader title={t("Monthly overview")} description={t("Money in and out of your wallet this month")} />
        <dl className="grid grid-cols-2 gap-px overflow-hidden border-y border-slate-100 bg-slate-100 sm:grid-cols-4 mt-4">
          {[
            [t("Monthly income"), d ? money(d.month.income) : "—"],
            [t("Monthly spending"), d ? money(d.month.spending) : "—"],
            [t("Monthly savings"), d ? money(d.month.savings) : "—"],
            [t("Transactions"), d ? String(d.month.transactionCount) : "—"],
          ].map(([l, v]) => (
            <div key={l} className="bg-white px-5 py-4 sm:px-6">
              <dt className="text-xs font-medium text-slate-500">{l}</dt>
              <dd className="tabular mt-1 text-lg font-bold text-slate-900">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="border-slate-100 lg:border-r">
            {d ? (
              <ChartCard
                className="border-0 shadow-none"
                title={t("Spending vs savings")}
                description={t("Last 6 months")}
                xKey="month"
                data={d.monthly}
                series={[{ key: "spending", label: t("Spending") }, { key: "savings", label: t("Savings") }]}
                refreshing={dash.refreshing}
              >
                <ColumnChart data={d.monthly} xKey="month" series={[{ key: "spending", label: t("Spending") }, { key: "savings", label: t("Savings") }]} />
              </ChartCard>
            ) : (
              <Skeleton className="m-6 h-64" />
            )}
          </div>
          <div>
            {d ? (
              <ChartCard
                className="border-0 shadow-none"
                title={t("Monthly transactions")}
                description={t("Number of transactions")}
                xKey="month"
                data={d.monthly}
                format="count"
                series={[{ key: "count", label: t("Transactions") }]}
                refreshing={dash.refreshing}
              >
                <TrendChart data={d.monthly} xKey="month" format="count" series={[{ key: "count", label: t("Transactions") }]} />
              </ChartCard>
            ) : (
              <Skeleton className="m-6 h-64" />
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        {d ? (
          <DonutCard
            title={t("Where your money went")}
            description={t("Spending by category · last 30 days")}
            centerLabel={t("spent")}
            data={d.spendingByCategory.map((c) => ({ label: c.category, value: c.amount }))}
          />
        ) : (
          <Skeleton className="h-72 rounded-2xl" />
        )}

        <Card>
          <CardHeader
            title={t("Recent transactions")}
            action={
              <Link href="/transactions" className="inline-flex items-center gap-1 text-sm font-semibold text-accent-700 hover:underline">
                {t("View all")} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            }
          />
          <div className="mt-4">
            <TransactionTable
              items={d?.recent}
              variant="personal"
              loading={dash.loading}
              onSelect={setSelected}
              emptyState={<EmptyState icon={<Send className="h-6 w-6" />} title={t("No transactions yet")} description={t("Add money or ask a friend to send you some to get started.")} />}
            />
          </div>
        </Card>
      </div>

      <TransactionDetail transaction={selected} open={!!selected} onClose={() => setSelected(null)} />
    </div>
  );
}
