import type { Metadata } from "next";
import { AdminAuditLogs } from "@/features/admin/operations";

export const metadata: Metadata = { title: "Audit logs" };

export default function Page() {
  return <AdminAuditLogs />;
}
