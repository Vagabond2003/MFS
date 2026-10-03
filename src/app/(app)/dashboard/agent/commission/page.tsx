import { AgentCommissionView } from "@/features/agent/pages";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Commission");

export default function Page() {
  return <AgentCommissionView />;
}
