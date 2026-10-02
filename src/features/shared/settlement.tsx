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
import { api } from "@/services";
import { formatDate, formatMoney, toMinor } from "@/lib/utils";
import { takaAmountSchema } from "@/lib/validation";
import type { SettlementView } from "@/types/domain";
import { InfoCard, QuickAmounts } from "./flow-aside";

/* ───────────── Settlement ───────────── */

function SettlementForm({ submit, busy, role }: FlowFormContext & { role: "AGENT" | "MERCHANT" }) {
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
          <p className="text-sm font-medium text-slate-700">Settlement type</p>
          <ChoiceChips
            ariaLabel="Settlement type"
            value={direction}
            onChange={setDirection}
            options={[
              { value: "TO_BANK", label: "E-money → bank" },
              { value: "FLOAT_TOP_UP", label: "Cash → e-money float" },
            ]}
          />
          <p className="text-xs text-slate-500">
            {direction === "TO_BANK" ? "Move surplus e-money to your linked bank account." : "Deposit outlet cash at the bank to top up your e-money float."}
          </p>
        </div>
      )}
      <Field label="Amount" required>
        {(p) => <AmountInput {...p} value={amount} onChange={(e) => setAmount(e.target.value)} />}
      </Field>
      <QuickAmounts values={[5000, 10000, 25000, 50000]} onPick={(v) => setAmount(String(v))} />
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" size="lg" fullWidth loading={busy}>
        Continue
      </Button>
    </form>
  );
}

export function SettlementHistory({ items, loading }: { items: SettlementView[] | undefined; loading: boolean }) {
  if (loading && !items) return <Skeleton className="m-6 h-40" />;
  if (!items?.length) return <EmptyState icon={<Landmark className="h-6 w-6" />} title="No settlements yet" />;
  return (
    <Table>
      <THead>
        <TH>Transaction</TH>
        <TH>Type</TH>
        <TH>Destination</TH>
        <TH align="right">Amount</TH>
        <TH>Requested</TH>
        <TH>Status</TH>
      </THead>
      <tbody>
        {items.map((s) => (
          <TR key={s.id}>
            <TD className="tabular font-mono text-xs">{s.trxId}</TD>
            <TD className="whitespace-nowrap">{s.direction === "TO_BANK" ? "To bank" : "Float top-up"}</TD>
            <TD className="text-slate-600">{s.destination}</TD>
            <TD align="right" className="tabular font-semibold">{formatMoney(s.amount)}</TD>
            <TD className="whitespace-nowrap text-slate-500">{formatDate(s.createdAt)}</TD>
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
  const user = useCurrentUser();
  const wallet = useApi(() => api.wallet.get(), [], { tags: ["wallet"] });
  const list = useApi(() => (role === "AGENT" ? api.agent.settlements() : api.merchant.settlements()), [role], { tags: ["settlements"], pollMs: 20_000 });
  const w = wallet.data;
  const locked =
    user.status !== "VERIFIED" ? (
      <p>Settlements are available after your {role === "AGENT" ? "agent account" : "business"} is verified.</p>
    ) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={role === "AGENT" ? "Business" : "Money"} title="Settlement" description={role === "AGENT" ? "Keep your float balanced between e-money and cash." : "Move your sales balance to your bank account."} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile label={role === "AGENT" ? "E-money balance" : "Available to settle"} value={w ? formatMoney(w.available) : "—"} icon={<Wallet className="h-4 w-4" />} />
        {role === "AGENT" && <StatTile label="Cash in hand" value={w ? formatMoney(w.cashInHand ?? 0) : "—"} icon={<Banknote className="h-4 w-4" />} />}
        <StatTile label="Pending settlement" value={w ? formatMoney(w.pending) : "—"} icon={<Hourglass className="h-4 w-4" />} />
      </div>
      <TransactionFlow
        locked={locked}
        doneHref={role === "AGENT" ? "/dashboard/agent" : "/dashboard/merchant"}
        pinLabel="Enter your PIN to authorise"
        confirmLabel={(q) => `Settle ${formatMoney(q.amount)}`}
        renderForm={(ctx) => <SettlementForm {...ctx} role={role} />}
        aside={<InfoCard title="Settlement" items={[{ label: "Fee", value: "Free" }, { label: "Clearing", value: "~2 min (demo)" }, { label: "OTP", value: "From ৳10,000" }]} />}
      />
      <Card>
        <CardHeader title="Settlement history" />
        <div className="mt-4">
          <SettlementHistory items={list.data} loading={list.loading} />
        </div>
      </Card>
    </div>
  );
}
