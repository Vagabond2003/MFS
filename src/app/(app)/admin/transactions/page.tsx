import type { Metadata } from "next";
import { AdminTransactions } from "@/features/admin/operations";

export const metadata: Metadata = { title: "All transactions" };

export default function Page() {
  return <AdminTransactions />;
}
