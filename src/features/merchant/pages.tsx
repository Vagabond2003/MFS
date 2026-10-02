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
import { api } from "@/services";
import { formatCount, formatMoney, toMinor } from "@/lib/utils";
import { takaAmountSchema } from "@/lib/validation";
import type { TransactionView } from "@/types/domain";
import { CATEGORY_META } from "../register/merchant-form";
import { DocumentList, StatusTimeline, VerificationProgress } from "../shared/verification";

/* ───────────── Sales analytics ───────────── */

export function SalesAnalyticsView() {
  const dash = useApi(() => api.merchant.dashboard(), [], { tags: ["dashboard", "transactions"] });
  const d = dash.data;
  if (dash.error && !d) return <ErrorState message={dash.error.message} onRetry={dash.reload} />;
  const avgTicket = d && d.month.count ? Math.round(d.month.revenue / Math.max(1, d.month.count)) : 0;
  const refundRate = d && d.month.revenue ? (d.monthly[5].refunds / d.month.revenue) * 100 : 0;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Analytics" title="Sales" description="How your business is performing across days, weeks and months." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Monthly revenue" value={d ? formatMoney(d.month.revenue) : "—"} icon={<TrendingUp className="h-4 w-4" />} />
        <StatTile label="Net revenue" value={d ? formatMoney(d.month.net) : "—"} icon={<ShoppingBag className="h-4 w-4" />} hint="After fees & refunds" />
        <StatTile label="Average ticket" value={d ? formatMoney(avgTicket) : "—"} icon={<Hash className="h-4 w-4" />} />
        <StatTile label="Refund rate" value={d ? `${refundRate.toFixed(1)}%` : "—"} icon={<Percent className="h-4 w-4" />} hint="Of this month's revenue" />
      </div>
      {!d ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-80 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title="Daily sales" description="Last 14 days" xKey="date" data={d.daily} series={[{ key: "sales", label: "Sales" }]}>
            <ColumnChart data={d.daily} xKey="date" series={[{ key: "sales", label: "Sales" }]} />
          </ChartCard>
          <ChartCard title="Weekly sales" description="Last 8 weeks (week starting Saturday)" xKey="week" data={d.weekly} series={[{ key: "sales", label: "Sales" }]}>
            <ColumnChart data={d.weekly} xKey="week" series={[{ key: "sales", label: "Sales" }]} />
          </ChartCard>
          <ChartCard title="Monthly revenue" description="Last 6 months" xKey="month" data={d.monthly} series={[{ key: "revenue", label: "Revenue" }]}>
            <TrendChart data={d.monthly} xKey="month" series={[{ key: "revenue", label: "Revenue" }]} />
          </ChartCard>
          <ChartCard title="Refunds" description="Refunded per month" xKey="month" data={d.monthly} series={[{ key: "refunds", label: "Refunds" }]}>
            <ColumnChart data={d.monthly} xKey="month" series={[{ key: "refunds", label: "Refunds" }]} />
          </ChartCard>
          <ChartCard title="Transaction volume" description="Payment attempts per day · last 14 days" xKey="date" data={d.daily} format="count" series={[{ key: "count", label: "Payments" }]}>
            <TrendChart data={d.daily} xKey="date" format="count" series={[{ key: "count", label: "Payments" }]} />
          </ChartCard>
          <DonutCard title="Payment methods" description="Share of revenue · last 30 days" centerLabel="received" data={d.paymentMethods.map((m) => ({ label: PAYMENT_METHOD_LABEL[m.method], value: m.amount }))} />
        </div>
      )}
      {d && (
        <Card>
          <CardHeader title="Payment methods" description="Last 30 days" />
          <div className="mt-2 divide-y divide-slate-100">
            {d.paymentMethods.map((m) => (
              <div key={m.method} className="flex items-center justify-between px-5 py-3 text-sm sm:px-6">
                <span className="font-medium text-slate-700">{PAYMENT_METHOD_LABEL[m.method]}</span>
                <span className="text-slate-500">
                  <span className="tabular font-semibold text-slate-900">{formatMoney(m.amount)}</span> · {formatCount(m.count)} payments
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
        if (reason.trim().length < 3) return setError("Enter a reason for the refund");
        setError(null);
        void submit({ kind: "MERCHANT_REFUND", trxId: payment.trxId, amount: toMinor(a.data), reason });
      }}
    >
      <div className="rounded-2xl bg-slate-50 px-4">
        <DescriptionList
          items={[
            { label: "Original payment", value: <span className="tabular font-mono">{payment.trxId}</span> },
            { label: "Customer", value: `${payment.counterparty.name} · ${payment.counterparty.account}` },
            { label: "Paid", value: formatMoney(payment.amount) },
            { label: "Refundable", value: formatMoney(refundable) },
          ]}
        />
      </div>
      <Field label="Refund amount" required hint="Full or partial">
        {(p) => <AmountInput {...p} value={amount} onChange={(e) => setAmount(e.target.value)} />}
      </Field>
      <Field label="Reason" required>
        {(p) => <Textarea {...p} rows={2} value={reason} maxLength={80} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Item out of stock" />}
      </Field>
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" size="lg" fullWidth loading={busy}>
        Continue
      </Button>
    </form>
  );
}

function RefundsInner() {
  const user = useCurrentUser();
  const params = useSearchParams();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [payment, setPayment] = useState<TransactionView | null>(null);
  const list = useApi(() => api.transactions.list({ type: "MERCHANT_PAYMENT", status: "SUCCESSFUL", search, page, pageSize: 8 }), [search, page], { tags: ["transactions"] });

  const trxParam = params.get("trx");
  useEffect(() => {
    if (!trxParam) return;
    api.transactions.get(trxParam).then((t) => t.canRefund && setPayment(t)).catch(() => undefined);
  }, [trxParam]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Payments" title="Refunds" description="Return all or part of a payment to the customer's wallet. Refunds are possible for 30 days." />
      {user.status !== "VERIFIED" ? (
        <Alert tone="warning">Refunds are available once your business is verified.</Alert>
      ) : (
        <Card>
          <CardHeader title="Refundable payments" description="Successful payments from the last 30 days" />
          <div className="mt-4 px-5 sm:px-6">
            <Input aria-label="Search payments" placeholder="Search by transaction ID or customer" leading={<Search className="h-4 w-4" />} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <div className="mt-4">
            <TransactionTable
              items={list.data?.items.filter((t) => t.canRefund)}
              variant="merchant"
              loading={list.loading}
              onSelect={setPayment}
              emptyState={<EmptyState icon={<Receipt className="h-6 w-6" />} title="No refundable payments" />}
            />
            {list.data && <Pagination page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} pageSize={list.data.pageSize} onChange={setPage} />}
          </div>
        </Card>
      )}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Refund history</h2>
        <TransactionHistory role="MERCHANT" variant="merchant" fixedType="REFUND" pageSize={6} />
      </div>
      <Modal open={!!payment} onClose={() => setPayment(null)} title="Issue refund" description="The customer is credited instantly. Authorise with your PIN." size="lg">
        {payment && (
          <TransactionFlow
            doneHref="/dashboard/merchant/refunds"
            onDone={() => setPayment(null)}
            pinLabel="Enter your PIN to authorise the refund"
            confirmLabel={(q) => `Refund ${formatMoney(q.amount)}`}
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
  const profile = useApi(() => api.profile.get(), [], { tags: ["profile"] });
  const p = profile.data;
  if (profile.error && !p) return <ErrorState message={profile.error.message} onRetry={profile.reload} />;
  if (!p?.merchant) return <Skeleton className="h-96 rounded-2xl" />;
  const m = p.merchant;
  const Cat = CATEGORY_META[m.category].icon;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Business" title="Business profile" description="Your verified business identity, documents and settlement account." />
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 bg-gradient-to-r from-accent-600 to-accent-500 p-6 text-accent-fg sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/15">
              <Cat className="h-7 w-7" aria-hidden />
            </span>
            <div>
              <p className="text-xl font-bold">{m.businessName}</p>
              <p className="text-sm opacity-90">
                {CATEGORY_META[m.category].label} · Merchant ID <span className="tabular font-mono">{m.merchantId}</span>
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
            <Alert tone="danger" title="Verification not approved" className="mt-5">
              {p.reviewNote}
            </Alert>
          )}
        </CardBody>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Business details" icon={<Building className="h-[18px] w-[18px]" />} />
          <CardBody>
            <DescriptionList
              items={[
                { label: "Owner", value: m.ownerName },
                { label: "Owner NID", value: p.nidMasked ?? "—" },
                { label: "Business address", value: m.businessAddress },
                { label: "Registration no.", value: m.registrationNumber },
                { label: "Trade license", value: m.tradeLicenseNumber },
                { label: "TIN / BIN", value: m.taxId ?? "—" },
                { label: "Settlement account", value: m.settlementAccount },
                { label: "Contact", value: `${p.user.phone} · ${p.user.email ?? "—"}` },
              ]}
            />
          </CardBody>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Verification documents" />
            <CardBody>
              <DocumentList documents={p.documents} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Status history" icon={<RotateCcw className="h-[18px] w-[18px]" />} />
            <CardBody>
              <StatusTimeline events={p.timeline} />
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
