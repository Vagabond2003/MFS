import { AdminVerifications } from "@/features/admin/verifications";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Verifications");

export default function Page() {
  return <AdminVerifications />;
}
