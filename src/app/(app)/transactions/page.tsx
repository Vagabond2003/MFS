import { TransactionsPage } from "@/features/shared/transactions-page";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Transactions");

export default function Page() {
  return <TransactionsPage />;
}
