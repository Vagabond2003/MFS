"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CircleCheck, CreditCard, Droplets, Flame, GraduationCap, Landmark, QrCode, Store, Tv, Wifi, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { Tabs } from "@/components/ui/data";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { AmountInput, ChoiceChips, Field, Input, PhoneInput, Select, Textarea } from "@/components/ui/form";
import { TransactionFlow, type FlowFormContext } from "@/components/flows/transaction-flow";
import { useApi } from "@/hooks/use-api";
import { useCurrentUser } from "@/hooks/use-auth";
import { api } from "@/services";
import { toApiError } from "@/services/errors";
import { cn, formatDate, formatMoney, toMinor } from "@/lib/utils";
import { phoneSchema, takaAmountSchema } from "@/lib/validation";
import type { BillDetails, Biller, ConnectionType, Operator } from "@/types/domain";
import { DemoHint, InfoCard, QuickAmounts } from "../shared/flow-aside";

const DONE = "/dashboard/personal";
const confirmWith = (verb: string) => (q: { total: number }) => `${verb} ${formatMoney(q.total)}`;

/* ───────────────────────── Send Money ───────────────────────── */

const sendSchema = z.object({ to: phoneSchema, amount: takaAmountSchema(10, 25_000), reference: z.string().trim().max(50).optional() });

function SendMoneyForm({ submit, busy }: FlowFormContext) {
  const form = useForm({ resolver: zodResolver(sendSchema), defaultValues: { to: "", amount: "", reference: "" } });
  const recent = useApi(() => api.personal.recentRecipients(), []);
  const { errors } = form.formState;
  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={form.handleSubmit((v) => submit({ kind: "SEND_MONEY", to: v.to, amount: toMinor(v.amount), reference: v.reference || undefined }))}
    >
      <Field label="Recipient mobile number" required error={errors.to?.message}>
        {(p) => <PhoneInput {...p} {...form.register("to")} />}
      </Field>
      {!!recent.data?.length && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">Recent</p>
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            {recent.data.map((r) => (
              <button
                key={r.phone}
                type="button"
                onClick={() => form.setValue("to", r.phone, { shouldValidate: true })}
                className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-left transition hover:border-accent-500"
              >
                <p className="text-sm font-medium text-slate-800">{r.name}</p>
                <p className="tabular text-xs text-slate-500">{r.phone}</p>
              </button>
            ))}
          </div>
        </div>
      )}
      <Field label="Amount" required error={errors.amount?.message}>
        {(p) => <AmountInput {...p} {...form.register("amount")} />}
      </Field>
      <QuickAmounts values={[500, 1000, 2000, 5000]} onPick={(v) => form.setValue("amount", String(v), { shouldValidate: true })} />
      <Field label="Reference" optional error={errors.reference?.message}>
        {(p) => <Input {...p} maxLength={50} placeholder="e.g. Rent share" {...form.register("reference")} />}
      </Field>
      <Button type="submit" size="lg" fullWidth loading={busy}>
        Continue
      </Button>
    </form>
  );
}

export function SendMoneyView() {
  return (
    <>
      <PageHeader eyebrow="Money" title="Send Money" description="Transfer to any personal Kosh wallet instantly." />
      <TransactionFlow
        doneHref={DONE}
        confirmLabel={confirmWith("Send")}
        renderForm={(ctx) => <SendMoneyForm {...ctx} />}
        aside={
          <>
            <InfoCard title="Fees & limits" items={[{ label: "Up to ৳1,000", value: "Free" }, { label: "Above ৳1,000", value: "৳5 per transfer" }, { label: "One-time code", value: "From ৳10,000" }]} />
            <DemoHint>
              <p>Send to <b>01710000002</b> (Tanvir) or <b>01710000003</b> (Farhana).</p>
              <p>An unregistered number is rejected by the server.</p>
            </DemoHint>
          </>
        }
      />
    </>
  );
}

/* ───────────────────────── Cash Out ───────────────────────── */

const cashOutSchema = z.object({ agentNumber: phoneSchema, amount: takaAmountSchema(50, 25_000) });

function CashOutForm({ submit, busy }: FlowFormContext) {
  const form = useForm({ resolver: zodResolver(cashOutSchema), defaultValues: { agentNumber: "", amount: "" } });
  const { errors } = form.formState;
  const amount = Number(form.watch("amount") || 0);
  return (
    <form className="space-y-5" noValidate onSubmit={form.handleSubmit((v) => submit({ kind: "CASH_OUT", agentNumber: v.agentNumber, amount: toMinor(v.amount) }))}>
      <Field label="Agent number" required error={errors.agentNumber?.message} hint="Ask the agent for their Kosh agent number">
        {(p) => <PhoneInput {...p} {...form.register("agentNumber")} />}
      </Field>
      <Field label="Amount" required error={errors.amount?.message}>
        {(p) => <AmountInput {...p} {...form.register("amount")} />}
      </Field>
      <QuickAmounts values={[1000, 2000, 5000, 10000]} onPick={(v) => form.setValue("amount", String(v), { shouldValidate: true })} />
      {amount > 0 && <p className="text-xs text-slate-500">The exact charge is calculated by the server on the next step (1.85% of the amount).</p>}
      <Button type="submit" size="lg" fullWidth loading={busy}>
        Continue
      </Button>
    </form>
  );
}

export function CashOutView() {
  return (
    <>
      <PageHeader eyebrow="Money" title="Cash Out" description="Withdraw cash from a verified Kosh agent." />
      <TransactionFlow
        doneHref={DONE}
        confirmLabel={confirmWith("Cash out")}
        renderForm={(ctx) => <CashOutForm {...ctx} />}
        aside={
          <>
            <InfoCard title="Cash Out charge" items={[{ label: "Charge", value: "1.85%" }, { label: "Minimum", value: "৳50" }, { label: "Per transaction", value: "Up to ৳25,000" }]} />
            <DemoHint>
              <p><b>01810000001</b> — verified agent (works).</p>
              <p><b>01810000002</b> — under review, so the server refuses it.</p>
            </DemoHint>
          </>
        }
      />
    </>
  );
}

/* ───────────────────────── Mobile Recharge ───────────────────────── */

export const OPERATORS: { value: Operator; label: string; prefixes: string[] }[] = [
  { value: "GRAMEENPHONE", label: "Grameenphone", prefixes: ["017", "013"] },
  { value: "ROBI", label: "Robi", prefixes: ["018"] },
  { value: "BANGLALINK", label: "Banglalink", prefixes: ["019", "014"] },
  { value: "AIRTEL", label: "Airtel", prefixes: ["016"] },
  { value: "TELETALK", label: "Teletalk", prefixes: ["015"] },
];

export function detectOperator(number: string): Operator | null {
  const d = number.replace(/\D/g, "").replace(/^880/, "0");
  return OPERATORS.find((o) => o.prefixes.some((p) => d.startsWith(p)))?.value ?? null;
}

const rechargeSchema = z.object({
  number: phoneSchema,
  operator: z.enum(["GRAMEENPHONE", "ROBI", "BANGLALINK", "TELETALK", "AIRTEL"], { error: "Choose an operator" }),
  connection: z.enum(["PREPAID", "POSTPAID"]),
  amount: takaAmountSchema(20, 1_000),
});

function RechargeForm({ submit, busy, ownNumber }: FlowFormContext & { ownNumber: string }) {
  const form = useForm<z.input<typeof rechargeSchema>, unknown, z.output<typeof rechargeSchema>>({
    resolver: zodResolver(rechargeSchema),
    defaultValues: { number: ownNumber, operator: detectOperator(ownNumber) ?? undefined, connection: "PREPAID", amount: "" },
  });
  const { errors } = form.formState;
  const number = form.watch("number");
  const operator = form.watch("operator");
  const connection = form.watch("connection");

  useEffect(() => {
    const op = detectOperator(number);
    if (op) form.setValue("operator", op);
  }, [number, form]);

  return (
    <form className="space-y-5" noValidate onSubmit={form.handleSubmit((v) => submit({ kind: "MOBILE_RECHARGE", number: v.number, operator: v.operator, connection: v.connection, amount: toMinor(v.amount) }))}>
      <Field label="Mobile number" required error={errors.number?.message} hint={number === ownNumber ? "Your own number" : undefined}>
        {(p) => (
          <PhoneInput
            {...p}
            {...form.register("number")}
          />
        )}
      </Field>
      {number !== ownNumber && (
        <button type="button" className="-mt-3 text-xs font-semibold text-accent-700 hover:underline" onClick={() => form.setValue("number", ownNumber)}>
          Use my number
        </button>
      )}
      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-700">Operator</p>
        <ChoiceChips ariaLabel="Operator" value={operator} onChange={(v) => form.setValue("operator", v, { shouldValidate: true })} options={OPERATORS.map((o) => ({ value: o.value, label: o.label }))} />
        {errors.operator && <p className="text-[13px] font-medium text-rose-600">{errors.operator.message}</p>}
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-700">Connection type</p>
        <ChoiceChips<ConnectionType> ariaLabel="Connection type" value={connection} onChange={(v) => form.setValue("connection", v)} options={[{ value: "PREPAID", label: "Prepaid" }, { value: "POSTPAID", label: "Postpaid" }]} />
      </div>
      <Field label="Amount" required error={errors.amount?.message}>
        {(p) => <AmountInput {...p} {...form.register("amount")} />}
      </Field>
      <QuickAmounts values={[20, 50, 100, 199, 299, 499]} onPick={(v) => form.setValue("amount", String(v), { shouldValidate: true })} />
      <Button type="submit" size="lg" fullWidth loading={busy}>
        Continue
      </Button>
    </form>
  );
}

export function RechargeView() {
  const user = useCurrentUser();
  return (
    <>
      <PageHeader eyebrow="Payments" title="Mobile Recharge" description="Top up any prepaid or postpaid number on every operator." />
      <TransactionFlow
        doneHref={DONE}
        confirmLabel={confirmWith("Recharge")}
        renderForm={(ctx) => <RechargeForm {...ctx} ownNumber={user.phone} />}
        aside={<InfoCard title="Recharge" items={[{ label: "Fee", value: "Free" }, { label: "Amount", value: "৳20 – ৳1,000" }, { label: "Operators", value: "All 5" }]} />}
      />
    </>
  );
}

/* ───────────────────────── Bill Payment ───────────────────────── */

const BILL_CATEGORIES: { value: Biller["category"]; label: string; icon: typeof Zap }[] = [
  { value: "ELECTRICITY", label: "Electricity", icon: Zap },
  { value: "GAS", label: "Gas", icon: Flame },
  { value: "WATER", label: "Water", icon: Droplets },
  { value: "INTERNET", label: "Internet", icon: Wifi },
  { value: "TV", label: "TV", icon: Tv },
  { value: "EDUCATION", label: "Education", icon: GraduationCap },
];

export function BillForm({
  submit,
  busy,
  mode,
}: FlowFormContext & { mode: "personal" | "agent" }) {
  const billers = useApi(() => api.lookup.billers(), []);
  const [category, setCategory] = useState<Biller["category"]>("ELECTRICITY");
  const [billerId, setBillerId] = useState("");
  const [account, setAccount] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [bill, setBill] = useState<BillDetails | null>(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = useMemo(() => billers.data?.filter((b) => b.category === category) ?? [], [billers.data, category]);
  // The chosen biller, or the first one in the category when none is chosen yet.
  const effectiveBillerId = list.some((b) => b.id === billerId) ? billerId : (list[0]?.id ?? "");
  const biller = billers.data?.find((b) => b.id === effectiveBillerId);

  const fetchBill = async () => {
    setFetching(true);
    setError(null);
    try {
      const b = await api.lookup.fetchBill(effectiveBillerId, account);
      setBill(b);
      setAmount(String(b.amountDue / 100));
    } catch (e) {
      setBill(null);
      setError(toApiError(e).message);
    } finally {
      setFetching(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = takaAmountSchema(10, 50_000).safeParse(amount);
    if (!amt.success) return setError(amt.error.issues[0].message);
    if (mode === "agent") {
      const ph = phoneSchema.safeParse(customerPhone);
      if (!ph.success) return setError(`Customer number: ${ph.error.issues[0].message}`);
      return void submit({ kind: "AGENT_CUSTOMER_PAYMENT", billerId: effectiveBillerId, accountNumber: account.trim(), customerPhone: ph.data, amount: toMinor(amt.data) });
    }
    void submit({ kind: "BILL_PAYMENT", billerId: effectiveBillerId, accountNumber: account.trim(), amount: toMinor(amt.data) });
  };

  return (
    <form className="space-y-5" noValidate onSubmit={onSubmit}>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" role="radiogroup" aria-label="Bill category">
        {BILL_CATEGORIES.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={category === value}
            onClick={() => { setCategory(value); setBill(null); }}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-semibold transition",
              category === value ? "border-accent-600 bg-accent-50 text-accent-700" : "border-slate-200 text-slate-600 hover:border-slate-300",
            )}
          >
            <Icon className="h-5 w-5" aria-hidden /> {label}
          </button>
        ))}
      </div>
      {billers.loading ? (
        <Skeleton className="h-11" />
      ) : (
        <Field label="Biller" required>
          {(p) => (
            <Select {...p} value={effectiveBillerId} onChange={(e) => { setBillerId(e.target.value); setBill(null); }}>
              {list.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      <div className="flex items-end gap-2">
        <Field label={biller?.accountLabel ?? "Account number"} required className="flex-1">
          {(p) => <Input {...p} value={account} onChange={(e) => { setAccount(e.target.value); setBill(null); }} placeholder="e.g. 88412031" />}
        </Field>
        <Button variant="outline" onClick={fetchBill} loading={fetching} disabled={!effectiveBillerId || account.trim().length < 4}>
          Fetch bill
        </Button>
      </div>
      {bill && (
        <div className="animate-fade-in rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm">
          <p className="flex items-center gap-1.5 font-semibold text-emerald-800">
            <CircleCheck className="h-4 w-4" aria-hidden /> Bill found
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-y-1 text-slate-700">
            <dt className="text-slate-500">Customer</dt>
            <dd className="text-right font-medium">{bill.customerName}</dd>
            <dt className="text-slate-500">Period</dt>
            <dd className="text-right font-medium">{bill.period}</dd>
            <dt className="text-slate-500">Due date</dt>
            <dd className="text-right font-medium">{formatDate(bill.dueDate)}</dd>
            <dt className="text-slate-500">Amount due</dt>
            <dd className="tabular text-right font-bold">{formatMoney(bill.amountDue)}</dd>
          </dl>
        </div>
      )}
      <Field label="Amount" required>
        {(p) => <AmountInput {...p} value={amount} onChange={(e) => setAmount(e.target.value)} />}
      </Field>
      {mode === "agent" && (
        <Field label="Customer mobile (for receipt)" required>
          {(p) => <PhoneInput {...p} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />}
        </Field>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" size="lg" fullWidth loading={busy} disabled={!effectiveBillerId || !account || !amount}>
        Continue
      </Button>
    </form>
  );
}

export function PayBillView() {
  return (
    <>
      <PageHeader eyebrow="Payments" title="Pay Bill" description="Utilities, internet, TV and education — paid in seconds." />
      <TransactionFlow
        doneHref={DONE}
        confirmLabel={confirmWith("Pay")}
        renderForm={(ctx) => <BillForm {...ctx} mode="personal" />}
        aside={
          <>
            <InfoCard title="Bill payment" items={[{ label: "Service charge", value: "৳5" }, { label: "Receipt", value: "Instant" }]} />
            <DemoHint>
              <p>Any 4–20 character account number returns a sample bill from the development biller gateway.</p>
            </DemoHint>
          </>
        }
      />
    </>
  );
}

/* ───────────────────────── Merchant Payment ───────────────────────── */

function MerchantPayForm({ submit, busy }: FlowFormContext) {
  const [mode, setMode] = useState<"id" | "qr">("id");
  const [input, setInput] = useState("");
  const [merchant, setMerchant] = useState<{ merchantId: string; businessName: string; paymentCode: string | null; amount: number | null } | null>(null);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolve = async () => {
    setResolving(true);
    setError(null);
    try {
      const m = await api.lookup.resolveMerchant(input);
      setMerchant(m);
      if (m.amount) setAmount(String(m.amount / 100));
    } catch (e) {
      setMerchant(null);
      setError(toApiError(e).message);
    } finally {
      setResolving(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!merchant) return setError("Verify the merchant first.");
    const amt = takaAmountSchema(1, 50_000).safeParse(amount);
    if (!amt.success) return setError(amt.error.issues[0].message);
    void submit({ kind: "MERCHANT_PAYMENT", merchantId: merchant.merchantId, paymentCode: merchant.paymentCode ?? undefined, amount: toMinor(amt.data), reference: reference || undefined });
  };

  return (
    <form className="space-y-5" noValidate onSubmit={onSubmit}>
      <Tabs
        ariaLabel="Pay by"
        value={mode}
        onChange={(m) => { setMode(m); setInput(""); setMerchant(null); setError(null); }}
        tabs={[
          { value: "id", label: <span className="flex items-center gap-1.5"><Store className="h-4 w-4" aria-hidden /> Merchant ID</span> },
          { value: "qr", label: <span className="flex items-center gap-1.5"><QrCode className="h-4 w-4" aria-hidden /> QR code</span> },
        ]}
        className="w-full [&>button]:flex-1 [&>button]:justify-center"
      />
      {mode === "id" ? (
        <Field label="Merchant ID" required>
          {(p) => <Input {...p} value={input} onChange={(e) => { setInput(e.target.value.toUpperCase()); setMerchant(null); }} placeholder="MR-40021" />}
        </Field>
      ) : (
        <Field label="QR code content" required hint="Camera scanning runs in the mobile app. Here, paste the text encoded in the merchant's QR.">
          {(p) => <Textarea {...p} rows={2} value={input} onChange={(e) => { setInput(e.target.value); setMerchant(null); }} placeholder="KOSH1|S|MR-40021|Spice Garden Restaurant" className="font-mono text-sm" />}
        </Field>
      )}
      {!merchant && (
        <Button variant="outline" onClick={resolve} loading={resolving} disabled={input.trim().length < 4}>
          Verify merchant
        </Button>
      )}
      {merchant && (
        <div className="flex animate-fade-in items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-emerald-600 shadow-sm">
            <Store className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 font-semibold text-slate-900">
              {merchant.businessName} <CircleCheck className="h-4 w-4 text-emerald-600" aria-label="Verified merchant" />
            </p>
            <p className="tabular text-xs text-slate-500">
              {merchant.merchantId}
              {merchant.paymentCode && ` · Payment request ${merchant.paymentCode}`}
            </p>
          </div>
        </div>
      )}
      <Field label="Amount" required hint={merchant?.amount ? "Set by the merchant's QR" : undefined}>
        {(p) => <AmountInput {...p} value={amount} onChange={(e) => setAmount(e.target.value)} readOnly={!!merchant?.amount} />}
      </Field>
      <Field label="Reference" optional>
        {(p) => <Input {...p} value={reference} maxLength={50} onChange={(e) => setReference(e.target.value)} placeholder="e.g. Table 4" />}
      </Field>
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" size="lg" fullWidth loading={busy} disabled={!merchant}>
        Continue
      </Button>
    </form>
  );
}

export function MerchantPayView() {
  return (
    <>
      <PageHeader eyebrow="Payments" title="Merchant Payment" description="Pay shops and restaurants with a Merchant ID or QR code." />
      <TransactionFlow
        doneHref={DONE}
        confirmLabel={confirmWith("Pay")}
        renderForm={(ctx) => <MerchantPayForm {...ctx} />}
        aside={
          <>
            <InfoCard title="Merchant payment" items={[{ label: "Fee for you", value: "Free" }, { label: "Refunds", value: "Issued by the merchant" }]} />
            <DemoHint>
              <p><b>MR-40021</b> — Spice Garden (verified).</p>
              <p><b>MR-40022</b> — FreshMart, pending verification: payments are blocked server-side.</p>
            </DemoHint>
          </>
        }
      />
    </>
  );
}

/* ───────────────────────── Add Money ───────────────────────── */

function AddMoneyForm({ submit, busy }: FlowFormContext) {
  const sources = useApi(() => api.wallet.fundingSources(), []);
  const [chosen, setSourceId] = useState("");
  const sourceId = chosen || sources.data?.[0]?.id || "";
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const amt = takaAmountSchema(100, 50_000).safeParse(amount);
        if (!amt.success) return setError(amt.error.issues[0].message);
        setError(null);
        void submit({ kind: "ADD_MONEY", sourceId, amount: toMinor(amt.data) });
      }}
    >
      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-700">From</p>
        {sources.loading && <Skeleton className="h-16" />}
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Funding source">
          {sources.data?.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={sourceId === s.id}
              onClick={() => setSourceId(s.id)}
              className={cn(
                "flex items-center gap-3 rounded-2xl border p-4 text-left transition",
                sourceId === s.id ? "border-accent-600 bg-accent-50 ring-2 ring-accent-500/20" : "border-slate-200 hover:border-slate-300",
              )}
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-slate-600 shadow-sm">
                {s.kind === "BANK" ? <Landmark className="h-5 w-5" aria-hidden /> : <CreditCard className="h-5 w-5" aria-hidden />}
              </span>
              <span>
                <span className="block text-sm font-semibold text-slate-900">{s.label}</span>
                <span className="tabular block text-xs text-slate-500">{s.masked}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      <Field label="Amount" required>
        {(p) => <AmountInput {...p} value={amount} onChange={(e) => setAmount(e.target.value)} />}
      </Field>
      <QuickAmounts values={[1000, 2000, 5000, 10000]} onPick={(v) => setAmount(String(v))} />
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" size="lg" fullWidth loading={busy} disabled={!sourceId}>
        Continue
      </Button>
    </form>
  );
}

export function AddMoneyView() {
  return (
    <>
      <PageHeader eyebrow="Money" title="Add Money" description="Move money into your wallet from a linked bank account or card." />
      <TransactionFlow
        doneHref={DONE}
        confirmLabel={confirmWith("Add")}
        renderForm={(ctx) => <AddMoneyForm {...ctx} />}
        aside={
          <>
            <InfoCard title="Add Money" items={[{ label: "Fee", value: "Free" }, { label: "Minimum", value: "৳100" }, { label: "Processed by", value: "Payment gateway" }]} />
            <DemoHint>
              <p>The development gateway approves all charges except amounts ending in <b>.13</b> (e.g. ৳500.13) — use that to see a declined payment.</p>
            </DemoHint>
          </>
        }
      />
    </>
  );
}
