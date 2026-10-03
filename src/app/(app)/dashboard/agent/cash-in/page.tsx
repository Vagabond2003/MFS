import { AgentCashInView } from "@/features/agent/flows";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Cash In");

export default function Page() {
  return <AgentCashInView />;
}
