import type { Metadata } from "next";
import { AgentCashOutView } from "@/features/agent/flows";

export const metadata: Metadata = { title: "Cash Out" };

export default function Page() {
  return <AgentCashOutView />;
}
