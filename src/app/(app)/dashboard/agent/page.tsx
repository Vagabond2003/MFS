import type { Metadata } from "next";
import { AgentDashboardView } from "@/features/agent/dashboard";

export const metadata: Metadata = { title: "Agent Home" };

export default function Page() {
  return <AgentDashboardView />;
}
