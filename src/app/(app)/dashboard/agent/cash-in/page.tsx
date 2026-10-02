import type { Metadata } from "next";
import { AgentCashInView } from "@/features/agent/flows";

export const metadata: Metadata = { title: "Cash In" };

export default function Page() {
  return <AgentCashInView />;
}
