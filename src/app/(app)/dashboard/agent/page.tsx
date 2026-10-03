import { AgentDashboardView } from "@/features/agent/dashboard";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Agent Home");

export default function Page() {
  return <AgentDashboardView />;
}
