"use client";

import { useState } from "react";
import { Banknote, Hourglass, Landmark, Wallet } from "lucide-react";
import { TxnStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { StatTile, Table, TD, TH, THead, TR } from "@/components/ui/data";
import { Alert, EmptyState, Skeleton } from "@/components/ui/feedback";
import { AmountInput, ChoiceChips, Field } from "@/components/ui/form";
import { TransactionFlow, type FlowFormContext } from "@/components/flows/transaction-flow";
import { useApi } from "@/hooks/use-api";
import { useCurrentUser } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { api } from "@/services";
import { formatDate, formatMoney, toMinor } from "@/lib/utils";
import { takaAmountSchema } from "@/lib/validation";
import type { SettlementView } from "@/types/domain";
import { InfoCard, QuickAmounts } from "./flow-aside";

/* ───────────── Settlement ───────────── */

function SettlementForm({ submit, busy, role }: FlowFormContext & { role: "AGENT" | "MERCHANT" }) {
  const { t } = useI18n();
  const [direction, setDirection] = useState<"TO_BANK" | "FLOAT_TOP_UP">("TO_BANK");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const a = takaAmountSchema(500, 1_000_000).safeParse(amount);
        if (!a.success) return setError(a.error.issues[0].message);
        setError(null);
        void submit({ kind: "SETTLEMENT", direction, amount: toMinor(a.data) });
      }}
    >
      {role === "AGENT" && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">{t("Settlement type")}</p>
          <ChoiceChips
            ariaLabel={t("Settlement type")}
            value={direction}
            onChange={setDirection}
            options={[
              { value: "TO_BANK", label: t("E-money → bank") },
              { value: "FLOAT_TOP_UP", label: t("Cash → e-money float") },
            ]}
          />
          <p className="text-xs text-slate-500">
            {direction === "TO_BANK" ? t("Move surplus e-money to your linked bank account.") : t("Deposit outlet cash at the bank to top up your e-money float.")}
          </p>
        </div>
      )}
      <Field label={t("Amount")} required>
        {(p) => <AmountInput {...p} value={amount} onChange={(e) => setAmount(e.target.value)} />}
      </Field>
      <QuickAmounts values={[5000, 10000, 25000, 50000]} onPick={(v) => setAmount(String(v))} />
      {error && <Alert tone="danger">{t(error)}</Alert>}
      <Button type="submit" size="lg" fullWidth loading={busy}>
        {t("Continue")}
      </Button>
    </form>
  );
}

export function SettlementHistory({ items, loading }: { items: SettlementView[] | undefined; loading: boolean }) {
  const { t, lang } = useI18n();
  if (loading && !items) return <Skeleton className="m-6 h-40" />;
  if (!items?.length) return <EmptyState icon={<Landmark className="h-6 w-6" />} title={t("No settlements yet")} />;
  return (
    <Table>
      <THead>
        <TH>{t("Transaction")}</TH>
        <TH>{t("Type")}</TH>
        <TH>{t("Destination")}</TH>
        <TH align="right">{t("Amount")}</TH>
        <TH>{t("Requested")}</TH>
        <TH>{t("Status")}</TH>
      </THead>
      <tbody>
        {items.map((s) => (
          <TR key={s.id}>
            <TD className="tabular font-mono text-xs">{s.trxId}</TD>
            <TD className="whitespace-nowrap">{s.direction === "TO_BANK" ? t("To bank") : t("Float top-up")}</TD>
            <TD className="text-slate-600">{t(s.destination)}</TD>
            <TD align="right" className="tabular font-semibold">{formatMoney(s.amount)}</TD>
            <TD className="whitespace-nowrap text-slate-500">{formatDate(s.createdAt, lang)}</TD>
            <TD>
              <TxnStatusBadge status={s.status} />
            </TD>
          </TR>
        ))}
      </tbody>
    </Table>
  );
}

export function SettlementPage({ role }: { role: "AGENT" | "MERCHANT" }) {
  const { t } = useI18n();
  const user = useCurrentUser();
  const wallet = useApi(() => api.wallet.get(), [], { tags: ["wallet"] });
  const list = useApi(() => (role === "AGENT" ? api.agent.settlements() : api.merchant.settlements()), [role], { tags: ["settlements"], pollMs: 20_000 });
  const w = wallet.data;
  const locked =
    user.status !== "VERIFIED" ? (
      <p>{role === "AGENT" ? t("Settlements are available after your agent account is verified.") : t("Settlements are available after your business is verified.")}</p>
    ) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={role === "AGENT" ? t("Business") : t("Money")} title={t("Settlement")} description={role === "AGENT" ? t("Keep your float balanced between e-money and cash.") : t("Move your sales balance to your bank account.")} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile label={role === "AGENT" ? t("E-money balance") : t("Available to settle")} value={w ? formatMoney(w.available) : "—"} icon={<Wallet className="h-4 w-4" />} />
        {role === "AGENT" && <StatTile label={t("Cash in hand")} value={w ? formatMoney(w.cashInHand ?? 0) : "—"} icon={<Banknote className="h-4 w-4" />} />}
        <StatTile label={t("Pending settlement")} value={w ? formatMoney(w.pending) : "—"} icon={<Hourglass className="h-4 w-4" />} />
      </div>
      <TransactionFlow
        locked={locked}
        doneHref={role === "AGENT" ? "/dashboard/agent" : "/dashboard/merchant"}
        pinLabel={t("Enter your PIN to authorise")}
        confirmLabel={(q) => t("Settle {amount}", { amount: formatMoney(q.amount) })}
        renderForm={(ctx) => <SettlementForm {...ctx} role={role} />}
        aside={<InfoCard title={t("Settlement")} items={[{ label: t("Fee"), value: t("Free") }, { label: t("Clearing"), value: t("~2 min (demo)") }, { label: t("OTP"), value: t("From ৳10,000") }]} />}
      />
      <Card>
        <CardHeader title={t("Settlement history")} />
        <div className="mt-4">
          <SettlementHistory items={list.data} loading={list.loading} />
        </div>
      </Card>
    </div>
  );
}
