import { AgentRechargeView } from "@/features/agent/flows";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Mobile Recharge");

export default function Page() {
  return <AgentRechargeView />;
}
