import type { Metadata } from "next";
import { AdminOverview } from "@/features/admin/overview";

export const metadata: Metadata = { title: "Admin overview" };

export default function Page() {
  return <AdminOverview />;
}
