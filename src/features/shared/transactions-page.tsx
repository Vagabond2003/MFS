"use client";

import { PageHeader } from "@/components/ui/card";
import { TransactionHistory } from "@/components/transactions/transaction-history";
import { useCurrentUser } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";

export function TransactionsPage() {
  const { t } = useI18n();
  const user = useCurrentUser();
  const copy = {
    PERSONAL: { title: t("Transactions"), description: t("Everything you've sent, received and paid. Select a transaction for its receipt.") },
    AGENT: { title: t("Agent transactions"), description: t("Every counter transaction with the commission you earned on it.") },
    MERCHANT: { title: t("Payment history"), description: t("Payments received, refunds issued and settlements to your bank.") },
    ADMIN: { title: t("Transactions"), description: "" },
  }[user.role];
  const variant = user.role === "AGENT" ? "agent" : user.role === "MERCHANT" ? "merchant" : "personal";
  return (
    <>
      <PageHeader title={copy.title} description={copy.description} />
      <TransactionHistory role={user.role} variant={variant} pageSize={12} />
    </>
  );
}
