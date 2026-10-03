"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Building, Hash, Percent, Receipt, RotateCcw, Search, ShoppingBag, TrendingUp } from "lucide-react";
import { ChartCard, ColumnChart, DonutCard, TrendChart } from "@/components/charts/charts";
import { AccountStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { DescriptionList, Pagination, StatTile } from "@/components/ui/data";
import { Alert, EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { AmountInput, Field, Input, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { TransactionFlow, type FlowFormContext } from "@/components/flows/transaction-flow";
import { PAYMENT_METHOD_LABEL } from "@/components/transactions/meta";
import { TransactionHistory } from "@/components/transactions/transaction-history";
import { TransactionTable } from "@/components/transactions/transaction-table";
import { useApi } from "@/hooks/use-api";
import { useCurrentUser } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { api } from "@/services";
import { formatCount, formatMoney, toMinor } from "@/lib/utils";
import { takaAmountSchema } from "@/lib/validation";
import type { TransactionView } from "@/types/domain";
import { CATEGORY_META } from "../register/merchant-form";
import { DocumentList, StatusTimeline, VerificationProgress } from "../shared/verification";

/* ───────────── Sales analytics ───────────── */

export function SalesAnalyticsView() {
  const { t } = useI18n();
  const dash = useApi(() => api.merchant.dashboard(), [], { tags: ["dashboard", "transactions"] });
  const d = dash.data;
  if (dash.error && !d) return <ErrorState message={dash.error.message} onRetry={dash.reload} />;
  const avgTicket = d && d.month.count ? Math.round(d.month.revenue / Math.max(1, d.month.count)) : 0;
  const refundRate = d && d.month.revenue ? (d.monthly[5].refunds / d.month.revenue) * 100 : 0;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t("Analytics")} title={t("Sales")} description={t("How your business is performing across days, weeks and months.")} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={t("Monthly revenue")} value={d ? formatMoney(d.month.revenue) : "—"} icon={<TrendingUp className="h-4 w-4" />} />
        <StatTile label={t("Net revenue")} value={d ? formatMoney(d.month.net) : "—"} icon={<ShoppingBag className="h-4 w-4" />} hint={t("After fees & refunds")} />
        <StatTile label={t("Average ticket")} value={d ? formatMoney(avgTicket) : "—"} icon={<Hash className="h-4 w-4" />} />
        <StatTile label={t("Refund rate")} value={d ? `${refundRate.toFixed(1)}%` : "—"} icon={<Percent className="h-4 w-4" />} hint={t("Of this month's revenue")} />
      </div>
      {!d ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-80 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title={t("Daily sales")} description={t("Last 14 days")} xKey="date" data={d.daily} series={[{ key: "sales", label: t("Sales") }]}>
            <ColumnChart data={d.daily} xKey="date" series={[{ key: "sales", label: t("Sales") }]} />
          </ChartCard>
          <ChartCard title={t("Weekly sales")} description={t("Last 8 weeks (week starting Saturday)")} xKey="week" data={d.weekly} series={[{ key: "sales", label: t("Sales") }]}>
            <ColumnChart data={d.weekly} xKey="week" series={[{ key: "sales", label: t("Sales") }]} />
          </ChartCard>
          <ChartCard title={t("Monthly revenue")} description={t("Last 6 months")} xKey="month" data={d.monthly} series={[{ key: "revenue", label: t("Revenue") }]}>
            <TrendChart data={d.monthly} xKey="month" series={[{ key: "revenue", label: t("Revenue") }]} />
          </ChartCard>
          <ChartCard title={t("Refunds")} description={t("Refunded per month")} xKey="month" data={d.monthly} series={[{ key: "refunds", label: t("Refunds") }]}>
            <ColumnChart data={d.monthly} xKey="month" series={[{ key: "refunds", label: t("Refunds") }]} />
          </ChartCard>
          <ChartCard title={t("Transaction volume")} description={t("Payment attempts per day · last 14 days")} xKey="date" data={d.daily} format="count" series={[{ key: "count", label: t("Payments") }]}>
            <TrendChart data={d.daily} xKey="date" format="count" series={[{ key: "count", label: t("Payments") }]} />
          </ChartCard>
          <DonutCard title={t("Payment methods")} description={t("Share of revenue · last 30 days")} centerLabel={t("received")} data={d.paymentMethods.map((m) => ({ label: PAYMENT_METHOD_LABEL[m.method], value: m.amount }))} />
        </div>
      )}
      {d && (
        <Card>
          <CardHeader title={t("Payment methods")} description={t("Last 30 days")} />
          <div className="mt-2 divide-y divide-slate-100">
            {d.paymentMethods.map((m) => (
              <div key={m.method} className="flex items-center justify-between px-5 py-3 text-sm sm:px-6">
                <span className="font-medium text-slate-700">{t(PAYMENT_METHOD_LABEL[m.method])}</span>
                <span className="text-slate-500">
                  <span className="tabular font-semibold text-slate-900">{formatMoney(m.amount)}</span> · {t("{n} payments", { n: formatCount(m.count) })}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ───────────── Refunds ───────────── */

function RefundForm({ submit, busy, payment }: FlowFormContext & { payment: TransactionView }) {
  const { t } = useI18n();
  const refundable = payment.amount - payment.refundedAmount;
  const [amount, setAmount] = useState(String(refundable / 100));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const a = takaAmountSchema(1, refundable / 100).safeParse(amount);
        if (!a.success) return setError(a.error.issues[0].message);
        if (reason.trim().length < 3) return setError(t("Enter a reason for the refund"));
        setError(null);
        void submit({ kind: "MERCHANT_REFUND", trxId: payment.trxId, amount: toMinor(a.data), reason });
      }}
    >
      <div className="rounded-2xl bg-slate-50 px-4">
        <DescriptionList
          items={[
            { label: t("Original payment"), value: <span className="tabular font-mono">{payment.trxId}</span> },
            { label: t("Customer"), value: `${payment.counterparty.name} · ${payment.counterparty.account}` },
            { label: t("Paid"), value: formatMoney(payment.amount) },
            { label: t("Refundable"), value: formatMoney(refundable) },
          ]}
        />
      </div>
      <Field label={t("Refund amount")} required hint={t("Full or partial")}>
        {(p) => <AmountInput {...p} value={amount} onChange={(e) => setAmount(e.target.value)} />}
      </Field>
      <Field label={t("Reason")} required>
        {(p) => <Textarea {...p} rows={2} value={reason} maxLength={80} onChange={(e) => setReason(e.target.value)} placeholder={t("e.g. Item out of stock")} />}
      </Field>
      {error && <Alert tone="danger">{t(error)}</Alert>}
      <Button type="submit" size="lg" fullWidth loading={busy}>
        {t("Continue")}
      </Button>
    </form>
  );
}

function RefundsInner() {
  const { t } = useI18n();
  const user = useCurrentUser();
  const params = useSearchParams();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [payment, setPayment] = useState<TransactionView | null>(null);
  const list = useApi(() => api.transactions.list({ type: "MERCHANT_PAYMENT", status: "SUCCESSFUL", search, page, pageSize: 8 }), [search, page], { tags: ["transactions"] });

  const trxParam = params.get("trx");
  useEffect(() => {
    if (!trxParam) return;
    api.transactions.get(trxParam).then((found) => found.canRefund && setPayment(found)).catch(() => undefined);
  }, [trxParam]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t("Payments")} title={t("Refunds")} description={t("Return all or part of a payment to the customer's wallet. Refunds are possible for 30 days.")} />
      {user.status !== "VERIFIED" ? (
        <Alert tone="warning">{t("Refunds are available once your business is verified.")}</Alert>
      ) : (
        <Card>
          <CardHeader title={t("Refundable payments")} description={t("Successful payments from the last 30 days")} />
          <div className="mt-4 px-5 sm:px-6">
            <Input aria-label={t("Search payments")} placeholder={t("Search by transaction ID or customer")} leading={<Search className="h-4 w-4" />} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <div className="mt-4">
            <TransactionTable
              items={list.data?.items.filter((item) => item.canRefund)}
              variant="merchant"
              loading={list.loading}
              onSelect={setPayment}
              emptyState={<EmptyState icon={<Receipt className="h-6 w-6" />} title={t("No refundable payments")} />}
            />
            {list.data && <Pagination page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} pageSize={list.data.pageSize} onChange={setPage} />}
          </div>
        </Card>
      )}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">{t("Refund history")}</h2>
        <TransactionHistory role="MERCHANT" variant="merchant" fixedType="REFUND" pageSize={6} />
      </div>
      <Modal open={!!payment} onClose={() => setPayment(null)} title={t("Issue refund")} description={t("The customer is credited instantly. Authorise with your PIN.")} size="lg">
        {payment && (
          <TransactionFlow
            doneHref="/dashboard/merchant/refunds"
            onDone={() => setPayment(null)}
            pinLabel={t("Enter your PIN to authorise the refund")}
            confirmLabel={(q) => t("Refund {amount}", { amount: formatMoney(q.amount) })}
            renderForm={(ctx) => <RefundForm {...ctx} payment={payment} />}
          />
        )}
      </Modal>
    </div>
  );
}

export function RefundsView() {
  return (
    <Suspense>
      <RefundsInner />
    </Suspense>
  );
}

/* ───────────── Business profile ───────────── */

export function BusinessProfileView() {
  const { t } = useI18n();
  const profile = useApi(() => api.profile.get(), [], { tags: ["profile"] });
  const p = profile.data;
  if (profile.error && !p) return <ErrorState message={profile.error.message} onRetry={profile.reload} />;
  if (!p?.merchant) return <Skeleton className="h-96 rounded-2xl" />;
  const m = p.merchant;
  const Cat = CATEGORY_META[m.category].icon;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t("Business")} title={t("Business profile")} description={t("Your verified business identity, documents and settlement account.")} />
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 bg-gradient-to-r from-accent-600 to-accent-500 p-6 text-accent-fg sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/15">
              <Cat className="h-7 w-7" aria-hidden />
            </span>
            <div>
              <p className="text-xl font-bold">{m.businessName}</p>
              <p className="text-sm opacity-90">
                {t(CATEGORY_META[m.category].label)} · {t("Merchant ID")} <span className="tabular font-mono">{m.merchantId}</span>
              </p>
            </div>
          </div>
          <div className="rounded-xl bg-white px-3 py-2">
            <AccountStatusBadge status={p.user.status} />
          </div>
        </div>
        <CardBody>
          <VerificationProgress track="MERCHANT" status={p.user.status} />
          {p.user.status === "REJECTED" && p.reviewNote && (
            <Alert tone="danger" title={t("Verification not approved")} className="mt-5">
              {t(p.reviewNote)}
            </Alert>
          )}
        </CardBody>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("Business details")} icon={<Building className="h-[18px] w-[18px]" />} />
          <CardBody>
            <DescriptionList
              items={[
                { label: t("Owner"), value: m.ownerName },
                { label: t("Owner NID"), value: p.nidMasked ?? "—" },
                { label: t("Business address"), value: m.businessAddress },
                { label: t("Registration no."), value: m.registrationNumber },
                { label: t("Trade license"), value: m.tradeLicenseNumber },
                { label: t("TIN / BIN"), value: m.taxId ?? "—" },
                { label: t("Settlement account"), value: t(m.settlementAccount) },
                { label: t("Contact"), value: `${p.user.phone} · ${p.user.email ?? "—"}` },
              ]}
            />
          </CardBody>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title={t("Verification documents")} />
            <CardBody>
              <DocumentList documents={p.documents} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={t("Status history")} icon={<RotateCcw className="h-[18px] w-[18px]" />} />
            <CardBody>
              <StatusTimeline events={p.timeline} />
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
