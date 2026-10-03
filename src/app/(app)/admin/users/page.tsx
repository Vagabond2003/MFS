import { AdminUsers } from "@/features/admin/users";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Users");

export default function Page() {
  return <AdminUsers />;
}
