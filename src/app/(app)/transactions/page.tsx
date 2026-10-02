import type { Metadata } from "next";
import { TransactionsPage } from "@/features/shared/transactions-page";

export const metadata: Metadata = { title: "Transactions" };

export default function Page() {
  return <TransactionsPage />;
}
