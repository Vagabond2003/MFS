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
import { useI18n } from "@/hooks/use-i18n";
import { accountStatusLabel } from "@/components/ui/badge";
import { formatMoney, toMinor } from "@/lib/utils";
import { phoneSchema, takaAmountSchema } from "@/lib/validation";
import type { Operator } from "@/types/domain";
import { BillForm, OPERATORS, detectOperator } from "../personal/flows";
import { DemoHint, InfoCard, QuickAmounts } from "../shared/flow-aside";

const DONE = "/dashboard/agent";

function useLockMessage() {
  const { t } = useI18n();
  const user = useCurrentUser();
  if (user.status === "VERIFIED") return undefined;
  return (
    <>
      <p className="font-semibold text-slate-900">{t("Available after verification")}</p>
      <p className="mt-1">
        {t("Your agent account status:")} <strong>{t(accountStatusLabel(user.status))}</strong>. {t("Counter operations are enabled once an administrator approves your application.")}
      </p>
      <Link href="/dashboard/agent/verification" className="mt-3 inline-block font-semibold text-accent-700 hover:underline">
        {t("View application status →")}
      </Link>
    </>
  );
}

/* ───────────── Cash In / Cash Out ───────────── */

const cashSchema = (max: number) => z.object({ customer: phoneSchema, amount: takaAmountSchema(50, max) });

function CustomerCashForm({ submit, busy, kind }: FlowFormContext & { kind: "AGENT_CASH_IN" | "AGENT_CASH_OUT" }) {
  const { t } = useI18n();
  const schema = cashSchema(kind === "AGENT_CASH_IN" ? 30_000 : 25_000);
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { customer: "", amount: "" } });
  const { errors } = form.formState;
  return (
    <form className="space-y-5" noValidate onSubmit={form.handleSubmit((v) => submit({ kind, customer: v.customer, amount: toMinor(v.amount) }))}>
      <Field label={t("Customer mobile number")} required error={errors.customer?.message} hint={t("The customer's personal Kosh wallet")}>
        {(p) => <PhoneInput {...p} {...form.register("customer")} />}
      </Field>
      <Field label={kind === "AGENT_CASH_IN" ? t("Cash received from customer") : t("Cash to hand over")} required error={errors.amount?.message}>
        {(p) => <AmountInput {...p} {...form.register("amount")} />}
      </Field>
      <QuickAmounts values={[500, 1000, 2000, 5000, 10000]} onPick={(v) => form.setValue("amount", String(v), { shouldValidate: true })} />
      <Button type="submit" size="lg" fullWidth loading={busy}>
        {t("Continue")}
      </Button>
    </form>
  );
}

export function AgentCashInView() {
  const { t } = useI18n();
  const locked = useLockMessage();
  return (
    <>
      <PageHeader eyebrow={t("Counter")} title={t("Cash In")} description={t("Customer gives you cash; you send e-money to their wallet.")} />
      <TransactionFlow
        locked={locked}
        doneHref={DONE}
        pinLabel={t("Enter your agent PIN")}
        confirmLabel={(q) => t("Cash in {amount}", { amount: formatMoney(q.amount) })}
        renderForm={(ctx) => <CustomerCashForm {...ctx} kind="AGENT_CASH_IN" />}
        aside={
          <>
            <InfoCard title={t("Cash In")} items={[{ label: t("Customer fee"), value: t("Free") }, { label: t("Your commission"), value: "0.20%" }, { label: t("Per transaction"), value: t("Up to ৳30,000") }]} />
            <DemoHint>
              <p>{t("Customer:")} <b>01700000001</b> {t("(Ashraful Islam), or any personal account you register.")}</p>
            </DemoHint>
          </>
        }
      />
    </>
  );
}

export function AgentCashOutView() {
  const { t } = useI18n();
  const locked = useLockMessage();
  return (
    <>
      <PageHeader eyebrow={t("Counter")} title={t("Cash Out")} description={t("Customer withdraws cash. They approve with a one-time code sent to their phone.")} />
      <TransactionFlow
        locked={locked}
        doneHref={DONE}
        pinLabel={t("Enter your agent PIN")}
        confirmLabel={(q) => t("Pay out {amount}", { amount: formatMoney(q.amount) })}
        renderForm={(ctx) => <CustomerCashForm {...ctx} kind="AGENT_CASH_OUT" />}
        aside={
          <>
            <InfoCard title={t("Cash Out")} items={[{ label: t("Customer charge"), value: "1.85%" }, { label: t("Your commission"), value: "0.40%" }, { label: t("Customer approval"), value: t("OTP to their phone") }]} />
            <DemoHint>
              <p>{t("The customer's code appears on screen (mock SMS provider).")}</p>
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
  const { t } = useI18n();
  const form = useForm<z.input<typeof rechargeSchema>, unknown, z.output<typeof rechargeSchema>>({ resolver: zodResolver(rechargeSchema), defaultValues: { number: "", amount: "" } });
  const { errors } = form.formState;
  const operator = form.watch("operator");
  return (
    <form className="space-y-5" noValidate onSubmit={form.handleSubmit((v) => submit({ kind: "AGENT_RECHARGE", number: v.number, operator: v.operator, amount: toMinor(v.amount) }))}>
      <Field label={t("Customer mobile number")} required error={errors.number?.message}>
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
        <p className="text-sm font-medium text-slate-700">{t("Operator")}</p>
        <ChoiceChips<Operator> ariaLabel={t("Operator")} value={operator} onChange={(v) => form.setValue("operator", v, { shouldValidate: true })} options={OPERATORS.map((o) => ({ value: o.value, label: t(o.label) }))} />
        {errors.operator?.message && <p className="text-[13px] font-medium text-rose-600">{t(errors.operator.message)}</p>}
      </div>
      <Field label={t("Amount (collect in cash)")} required error={errors.amount?.message}>
        {(p) => <AmountInput {...p} {...form.register("amount")} />}
      </Field>
      <QuickAmounts values={[20, 50, 100, 200, 500]} onPick={(v) => form.setValue("amount", String(v), { shouldValidate: true })} />
      <Button type="submit" size="lg" fullWidth loading={busy}>
        {t("Continue")}
      </Button>
    </form>
  );
}

export function AgentRechargeView() {
  const { t } = useI18n();
  const locked = useLockMessage();
  return (
    <>
      <PageHeader eyebrow={t("Counter")} title={t("Mobile Recharge")} description={t("Recharge a customer's number and collect the amount in cash.")} />
      <TransactionFlow
        locked={locked}
        doneHref={DONE}
        pinLabel={t("Enter your agent PIN")}
        confirmLabel={(q) => t("Recharge {amount}", { amount: formatMoney(q.amount) })}
        renderForm={(ctx) => <AgentRechargeForm {...ctx} />}
        aside={<InfoCard title={t("Recharge")} items={[{ label: t("Your commission"), value: "2.50%" }, { label: t("Amount"), value: "৳20 – ৳1,000" }]} />}
      />
    </>
  );
}

/* ───────────── Customer payment (bills on behalf of walk-ins) ───────────── */

export function AgentCustomerPaymentView() {
  const { t } = useI18n();
  const locked = useLockMessage();
  return (
    <>
      <PageHeader eyebrow={t("Counter")} title={t("Customer Payment")} description={t("Pay a walk-in customer's bill from your e-money and collect cash.")} />
      <TransactionFlow
        locked={locked}
        doneHref={DONE}
        pinLabel={t("Enter your agent PIN")}
        confirmLabel={(q) => t("Pay {amount}", { amount: formatMoney(q.amount) })}
        renderForm={(ctx) => <BillForm {...ctx} mode="agent" />}
        aside={<InfoCard title={t("Customer payment")} items={[{ label: t("Your commission"), value: "0.5% (৳2–৳20)" }, { label: t("Receipt"), value: t("Sent to customer") }]} />}
      />
    </>
  );
}
