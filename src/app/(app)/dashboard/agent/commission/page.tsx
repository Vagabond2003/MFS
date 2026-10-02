import type { Metadata } from "next";
import { AgentCommissionView } from "@/features/agent/pages";

export const metadata: Metadata = { title: "Commission" };

export default function Page() {
  return <AgentCommissionView />;
}
