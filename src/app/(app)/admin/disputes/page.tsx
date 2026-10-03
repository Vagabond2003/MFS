import { AdminDisputes } from "@/features/admin/operations";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Disputes");

export default function Page() {
  return <AdminDisputes />;
}
