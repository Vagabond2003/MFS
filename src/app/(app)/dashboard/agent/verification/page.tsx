import type { Metadata } from "next";
import { AgentVerificationView } from "@/features/agent/pages";

export const metadata: Metadata = { title: "Agent verification" };

export default function Page() {
  return <AgentVerificationView />;
}
