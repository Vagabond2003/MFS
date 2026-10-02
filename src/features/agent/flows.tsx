"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { AmountInput, ChoiceChips, Field, PhoneInput } from "@/components/ui/form";
import { TransactionFlow, type FlowFormContext } from "@/components/flows/transaction-flow";
import { useCurrentUser } from "@/hooks/use-auth";
import { formatMoney, toMinor } from "@/lib/utils";
import { phoneSchema, takaAmountSchema } from "@/lib/validation";
import type { Operator } from "@/types/domain";
import { BillForm, OPERATORS, detectOperator } from "../personal/flows";
import { DemoHint, InfoCard, QuickAmounts } from "../shared/flow-aside";

const DONE = "/dashboard/agent";

function useLockMessage() {
  const user = useCurrentUser();
  if (user.status === "VERIFIED") return undefined;
  return (
    <>
      <p className="font-semibold text-slate-900">Available after verification</p>
      <p className="mt-1">
        Your agent account is <strong>{user.status.replace(/_/g, " ").toLowerCase()}</strong>. Counter operations are enabled once an administrator approves your application.
      </p>
      <Link href="/dashboard/agent/verification" className="mt-3 inline-block font-semibold text-accent-700 hover:underline">
        View application status →
      </Link>
    </>
  );
}

/* ───────────── Cash In / Cash Out ───────────── */

const cashSchema = (max: number) => z.object({ customer: phoneSchema, amount: takaAmountSchema(50, max) });

function CustomerCashForm({ submit, busy, kind }: FlowFormContext & { kind: "AGENT_CASH_IN" | "AGENT_CASH_OUT" }) {
  const schema = cashSchema(kind === "AGENT_CASH_IN" ? 30_000 : 25_000);
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { customer: "", amount: "" } });
  const { errors } = form.formState;
  return (
    <form className="space-y-5" noValidate onSubmit={form.handleSubmit((v) => submit({ kind, customer: v.customer, amount: toMinor(v.amount) }))}>
      <Field label="Customer mobile number" required error={errors.customer?.message} hint="The customer's personal Kosh wallet">
        {(p) => <PhoneInput {...p} {...form.register("customer")} />}
      </Field>
      <Field label={kind === "AGENT_CASH_IN" ? "Cash received from customer" : "Cash to hand over"} required error={errors.amount?.message}>
        {(p) => <AmountInput {...p} {...form.register("amount")} />}
      </Field>
      <QuickAmounts values={[500, 1000, 2000, 5000, 10000]} onPick={(v) => form.setValue("amount", String(v), { shouldValidate: true })} />
      <Button type="submit" size="lg" fullWidth loading={busy}>
        Continue
      </Button>
    </form>
  );
}

export function AgentCashInView() {
  const locked = useLockMessage();
  return (
    <>
      <PageHeader eyebrow="Counter" title="Cash In" description="Customer gives you cash; you send e-money to their wallet." />
      <TransactionFlow
        locked={locked}
        doneHref={DONE}
        pinLabel="Enter your agent PIN"
        confirmLabel={(q) => `Cash in ${formatMoney(q.amount)}`}
        renderForm={(ctx) => <CustomerCashForm {...ctx} kind="AGENT_CASH_IN" />}
        aside={
          <>
            <InfoCard title="Cash In" items={[{ label: "Customer fee", value: "Free" }, { label: "Your commission", value: "0.20%" }, { label: "Per transaction", value: "Up to ৳30,000" }]} />
            <DemoHint>
              <p>Customers: <b>01710000001</b>, <b>01710000002</b>, <b>01710000003</b>.</p>
            </DemoHint>
          </>
        }
      />
    </>
  );
}

export function AgentCashOutView() {
  const locked = useLockMessage();
  return (
    <>
      <PageHeader eyebrow="Counter" title="Cash Out" description="Customer withdraws cash. They approve with a one-time code sent to their phone." />
      <TransactionFlow
        locked={locked}
        doneHref={DONE}
        pinLabel="Enter your agent PIN"
        confirmLabel={(q) => `Pay out ${formatMoney(q.amount)}`}
        renderForm={(ctx) => <CustomerCashForm {...ctx} kind="AGENT_CASH_OUT" />}
        aside={
          <>
            <InfoCard title="Cash Out" items={[{ label: "Customer charge", value: "1.85%" }, { label: "Your commission", value: "0.40%" }, { label: "Customer approval", value: "OTP to their phone" }]} />
            <DemoHint>
              <p>The customer&apos;s code appears on screen (mock SMS provider).</p>
            </DemoHint>
          </>
        }
      />
    </>
  );
}

/* ───────────── Recharge ───────────── */

const rechargeSchema = z.object({
  number: phoneSchema,
  operator: z.enum(["GRAMEENPHONE", "ROBI", "BANGLALINK", "TELETALK", "AIRTEL"], { error: "Choose an operator" }),
  amount: takaAmountSchema(20, 1_000),
});

function AgentRechargeForm({ submit, busy }: FlowFormContext) {
  const form = useForm<z.input<typeof rechargeSchema>, unknown, z.output<typeof rechargeSchema>>({ resolver: zodResolver(rechargeSchema), defaultValues: { number: "", amount: "" } });
  const { errors } = form.formState;
  const operator = form.watch("operator");
  return (
    <form className="space-y-5" noValidate onSubmit={form.handleSubmit((v) => submit({ kind: "AGENT_RECHARGE", number: v.number, operator: v.operator, amount: toMinor(v.amount) }))}>
      <Field label="Customer mobile number" required error={errors.number?.message}>
        {(p) => (
          <PhoneInput
            {...p}
            {...form.register("number", {
              onChange: (e) => {
                const op = detectOperator(e.target.value);
                if (op) form.setValue("operator", op);
              },
            })}
          />
        )}
      </Field>
      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-700">Operator</p>
        <ChoiceChips<Operator> ariaLabel="Operator" value={operator} onChange={(v) => form.setValue("operator", v, { shouldValidate: true })} options={OPERATORS.map((o) => ({ value: o.value, label: o.label }))} />
        {errors.operator && <p className="text-[13px] font-medium text-rose-600">{errors.operator.message}</p>}
      </div>
      <Field label="Amount (collect in cash)" required error={errors.amount?.message}>
        {(p) => <AmountInput {...p} {...form.register("amount")} />}
      </Field>
      <QuickAmounts values={[20, 50, 100, 200, 500]} onPick={(v) => form.setValue("amount", String(v), { shouldValidate: true })} />
      <Button type="submit" size="lg" fullWidth loading={busy}>
        Continue
      </Button>
    </form>
  );
}

export function AgentRechargeView() {
  const locked = useLockMessage();
  return (
    <>
      <PageHeader eyebrow="Counter" title="Mobile Recharge" description="Recharge a customer's number and collect the amount in cash." />
      <TransactionFlow
        locked={locked}
        doneHref={DONE}
        pinLabel="Enter your agent PIN"
        confirmLabel={(q) => `Recharge ${formatMoney(q.amount)}`}
        renderForm={(ctx) => <AgentRechargeForm {...ctx} />}
        aside={<InfoCard title="Recharge" items={[{ label: "Your commission", value: "2.50%" }, { label: "Amount", value: "৳20 – ৳1,000" }]} />}
      />
    </>
  );
}

/* ───────────── Customer payment (bills on behalf of walk-ins) ───────────── */

export function AgentCustomerPaymentView() {
  const locked = useLockMessage();
  return (
    <>
      <PageHeader eyebrow="Counter" title="Customer Payment" description="Pay a walk-in customer's bill from your e-money and collect cash." />
      <TransactionFlow
        locked={locked}
        doneHref={DONE}
        pinLabel="Enter your agent PIN"
        confirmLabel={(q) => `Pay ${formatMoney(q.amount)}`}
        renderForm={(ctx) => <BillForm {...ctx} mode="agent" />}
        aside={<InfoCard title="Customer payment" items={[{ label: "Your commission", value: "0.5% (৳2–৳20)" }, { label: "Receipt", value: "Sent to customer" }]} />}
      />
    </>
  );
}
