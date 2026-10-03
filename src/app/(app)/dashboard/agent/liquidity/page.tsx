import { AgentLiquidityView } from "@/features/insights/agent";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Liquidity planner");

export default function Page() {
  return <AgentLiquidityView />;
}
