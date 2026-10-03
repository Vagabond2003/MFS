import { PersonalDashboardView } from "@/features/personal/dashboard";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Home");

export default function Page() {
  return <PersonalDashboardView />;
}
