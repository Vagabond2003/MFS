import type { Metadata } from "next";
import { AgentRechargeView } from "@/features/agent/flows";

export const metadata: Metadata = { title: "Mobile Recharge" };

export default function Page() {
  return <AgentRechargeView />;
}
