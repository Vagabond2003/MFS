import { AdminIntelligenceView } from "@/features/insights/admin";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Network intelligence");

export default function Page() {
  return <AdminIntelligenceView />;
}
