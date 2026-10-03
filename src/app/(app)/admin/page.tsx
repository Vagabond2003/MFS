import { AdminOverview } from "@/features/admin/overview";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Admin overview");

export default function Page() {
  return <AdminOverview />;
}
