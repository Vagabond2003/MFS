import { AdminAuditLogs } from "@/features/admin/operations";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Audit logs");

export default function Page() {
  return <AdminAuditLogs />;
}
