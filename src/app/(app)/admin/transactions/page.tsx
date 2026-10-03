import { AdminTransactions } from "@/features/admin/operations";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("All transactions");

export default function Page() {
  return <AdminTransactions />;
}
