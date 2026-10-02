import type { Metadata } from "next";
import { AdminDisputes } from "@/features/admin/operations";

export const metadata: Metadata = { title: "Disputes" };

export default function Page() {
  return <AdminDisputes />;
}
