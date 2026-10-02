import type { Metadata } from "next";
import { AgentRegistration } from "@/features/register/agent-form";

export const metadata: Metadata = { title: "Agent application" };

export default function Page() {
  return <AgentRegistration />;
}
