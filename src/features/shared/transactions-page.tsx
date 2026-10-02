"use client";

import { PageHeader } from "@/components/ui/card";
import { TransactionHistory } from "@/components/transactions/transaction-history";
import { useCurrentUser } from "@/hooks/use-auth";

export function TransactionsPage() {
  const user = useCurrentUser();
  const copy = {
    PERSONAL: { title: "Transactions", description: "Everything you've sent, received and paid. Select a transaction for its receipt." },
    AGENT: { title: "Agent transactions", description: "Every counter transaction with the commission you earned on it." },
    MERCHANT: { title: "Payment history", description: "Payments received, refunds issued and settlements to your bank." },
    ADMIN: { title: "Transactions", description: "" },
  }[user.role];
  const variant = user.role === "AGENT" ? "agent" : user.role === "MERCHANT" ? "merchant" : "personal";
  return (
    <>
      <PageHeader title={copy.title} description={copy.description} />
      <TransactionHistory role={user.role} variant={variant} pageSize={12} />
    </>
  );
}
