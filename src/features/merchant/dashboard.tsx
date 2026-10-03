"use client";

import Link from "next/link";
import {
  ArrowRight,
  Building,
  CircleCheck,
  CircleX,
  FileClock,
  Hourglass,
  Landmark,
  LockKeyhole,
  QrCode,
  ReceiptText,
  RotateCcw,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { ChartCard, ColumnChart, DonutCard } from "@/components/charts/charts";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { StatTile } from "@/components/ui/data";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { PAYMENT_METHOD_LABEL } from "@/components/transactions/meta";
import { TransactionDetail } from "@/components/transactions/transaction-detail";
import { TransactionTable } from "@/components/transactions/transaction-table";
import { useApi } from "@/hooks/use-api";
import { useCurrentUser } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { msg } from "@/lib/i18n/core";
import { api } from "@/services";
import { cn, formatCount, formatMoney } from "@/lib/utils";
import { useState } from "react";
import type { TransactionView } from "@/types/domain";
import { VerificationProgress } from "../shared/verification";

const ACTIONS = [
  { href: "/dashboard/merchant/receive", label: msg("Receive Payment"), icon: Wallet, needsVerified: true },
  { href: "/dashboard/merchant/qr", label: msg("Generate QR"), icon: QrCode, needsVerified: true },
  { href: "/transactions", label: msg("Payment History"), icon: FileClock, needsVerified: false },
  { href: "/dashboard/merchant/refunds", label: msg("Refund"), icon: RotateCcw, needsVerified: true },
  { href: "/dashboard/merchant/settlement", label: msg("Settlement"), icon: Landmark, needsVerified: true },
  { href: "/dashboard/merchant/business", label: msg("Business Profile"), icon: Building, needsVerified: false },
];

export function MerchantDashboardView() {
  const { t } = useI18n();
  const user = useCurrentUser();
  const dash = useApi(() => api.merchant.dashboard(), [], { tags: ["dashboard", "wallet", "transactions"], pollMs: 30_000 });
  const [selected, setSelected] = useState<TransactionView | null>(null);
  const d = dash.data;
  const verified = user.status === "VERIFIED";

  if (dash.error && !d) return <ErrorState message={dash.error.message} onRetry={dash.reload} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-700">{t("Business overview")}</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">{user.businessName}</h1>
          <p className="tabular text-sm text-slate-500">{t("Merchant ID")} {user.merchantId}</p>
        </div>
        {verified && (
          <ButtonLink href="/dashboard/merchant/receive" size="lg" className="sm:hidden">
            <Wallet className="h-4 w-4" aria-hidden /> {t("Receive payment")}
          </ButtonLink>
        )}
      </div>

      {!verified && (
        <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
            <div className="flex flex-1 items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-100 text-indigo-700">
                <LockKeyhole className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h2 className="font-semibold text-slate-900">{t("Merchant payments are not enabled yet")}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {t("Customers can't pay {business} until your business documents are verified. QR codes, refunds and settlements unlock after approval.", { business: user.businessName ?? "" })}
                </p>
              </div>
            </div>
            <div className="w-full lg:w-[380px]">
              <VerificationProgress track="MERCHANT" status={user.status} />
              <ButtonLink href="/dashboard/merchant/business" variant="outline" size="sm" className="mt-4">
                {t("View verification")}
              </ButtonLink>
            </div>
          </div>
        </Card>
      )}

      {/* Business overview */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label={t("Current balance")} value={d ? formatMoney(d.wallet.available) : "—"} icon={<Wallet className="h-4 w-4" />} hint={d && d.wallet.pending > 0 ? t("{amount} settling", { amount: formatMoney(d.wallet.pending) }) : t("Available to settle")} />
        <StatTile label={t("Today's sales")} value={d ? formatMoney(d.today.revenue) : "—"} icon={<ShoppingBag className="h-4 w-4" />} hint={d ? t("{n} successful payments", { n: d.today.successful }) : undefined} />
        <StatTile label={t("Monthly sales")} value={d ? formatMoney(d.month.revenue) : "—"} icon={<TrendingUp className="h-4 w-4" />} hint={d ? t("{n} payments this month", { n: formatCount(d.month.count) }) : undefined} />
        <StatTile label={t("Pending payments")} value={d ? formatMoney(d.pendingPayments) : "—"} icon={<Hourglass className="h-4 w-4" />} hint={t("Online checkout, clears next day")} />
      </div>

      {/* Quick actions */}
      <Card className="p-2">
        <ul className="grid grid-cols-3 gap-1 sm:grid-cols-6">
          {ACTIONS.map(({ href, label, icon: Icon, needsVerified }) => {
            const disabled = needsVerified && !verified;
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-disabled={disabled}
                  className={cn("flex flex-col items-center gap-2 rounded-xl px-2 py-4 text-center transition", disabled ? "opacity-50" : "hover:bg-accent-50")}
                >
                  <span className="relative grid h-11 w-11 place-items-center rounded-xl bg-accent-600 text-accent-fg">
                    <Icon className="h-5 w-5" aria-hidden />
                    {disabled && <LockKeyhole className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-white p-0.5 text-slate-500" aria-label={t("Locked")} />}
                  </span>
                  <span className="text-xs font-semibold text-slate-700">{t(label)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* Daily & monthly statistics */}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title={t("Today")} description={t("Daily statistics")} />
          <dl className="mt-4 grid grid-cols-2 border-t border-slate-100 sm:grid-cols-5">
            {[
              { l: t("Today's revenue"), v: d ? formatMoney(d.today.revenue) : "—", icon: TrendingUp },
              { l: t("Orders"), v: d ? String(d.today.orders) : "—", icon: ReceiptText },
              { l: t("Successful"), v: d ? String(d.today.successful) : "—", icon: CircleCheck },
              { l: t("Failed"), v: d ? String(d.today.failed) : "—", icon: CircleX },
              { l: t("Refunds"), v: d ? formatMoney(d.today.refunds) : "—", icon: RotateCcw },
            ].map(({ l, v, icon: Icon }, i) => (
              <div key={l} className={cn("px-5 py-4", i > 0 && "sm:border-l", "border-slate-100", i >= 2 && "border-t sm:border-t-0")}>
                <dt className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  <Icon className="h-3.5 w-3.5" aria-hidden /> {l}
                </dt>
                <dd className="tabular mt-1 text-lg font-bold text-slate-900">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card>
          <CardHeader title={t("This month")} description={t("Monthly statistics")} />
          <dl className="mt-4 grid grid-cols-2 border-t border-slate-100 sm:grid-cols-4">
            {[
              { l: t("Monthly revenue"), v: d ? formatMoney(d.month.revenue) : "—" },
              { l: t("Monthly expenses"), v: d ? formatMoney(d.month.expenses) : "—", hint: t("Service fees + refunds") },
              { l: t("Net revenue"), v: d ? formatMoney(d.month.net) : "—", strong: true },
              { l: t("Transaction count"), v: d ? formatCount(d.month.count) : "—" },
            ].map(({ l, v, hint, strong }, i) => (
              <div key={l} className={cn("px-5 py-4 border-slate-100", i > 0 && "sm:border-l", i >= 2 && "border-t sm:border-t-0")}>
                <dt className="text-xs font-medium text-slate-500">{l}</dt>
                <dd className={cn("tabular mt-1 text-lg font-bold", strong ? "text-accent-700" : "text-slate-900")}>{v}</dd>
                {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
              </div>
            ))}
          </dl>
        </Card>
      </div>

      {/* Analytics */}
      {d ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <ChartCard title={t("Daily sales")} description={t("Last 14 days")} xKey="date" data={d.daily} series={[{ key: "sales", label: t("Sales") }]} refreshing={dash.refreshing}
            action={<Link href="/dashboard/merchant/sales" className="mr-1 text-xs font-semibold text-accent-700 hover:underline">{t("Full analytics")}</Link>}
          >
            <ColumnChart data={d.daily} xKey="date" series={[{ key: "sales", label: t("Sales") }]} />
          </ChartCard>
          <DonutCard
            title={t("Payment methods")}
            description={t("Last 30 days")}
            centerLabel={t("received")}
            data={d.paymentMethods.map((m) => ({ label: PAYMENT_METHOD_LABEL[m.method], value: m.amount }))}
          />
          <ChartCard className="lg:col-span-2" title={t("Monthly revenue & refunds")} description={t("Last 6 months")} xKey="month" data={d.monthly} series={[{ key: "revenue", label: t("Revenue") }, { key: "refunds", label: t("Refunds") }]} refreshing={dash.refreshing}>
            <ColumnChart data={d.monthly} xKey="month" series={[{ key: "revenue", label: t("Revenue") }, { key: "refunds", label: t("Refunds") }]} />
          </ChartCard>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      )}

      <Card>
        <CardHeader
          title={t("Recent payments")}
          action={
            <Link href="/transactions" className="inline-flex items-center gap-1 text-sm font-semibold text-accent-700 hover:underline">
              {t("All payments")} <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          }
        />
        <div className="mt-4">
          <TransactionTable
            items={d?.recent}
            variant="merchant"
            loading={dash.loading}
            onSelect={setSelected}
            emptyState={<EmptyState icon={<QrCode className="h-6 w-6" />} title={t("No payments yet")} description={verified ? t("Show your QR code to customers to receive your first payment.") : t("Payments will appear here once your business is verified.")} />}
          />
        </div>
      </Card>
      <TransactionDetail transaction={selected} open={!!selected} onClose={() => setSelected(null)} />
    </div>
  );
}
