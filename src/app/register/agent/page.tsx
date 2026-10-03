import { AgentRegistration } from "@/features/register/agent-form";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Agent application");

export default function Page() {
  return <AgentRegistration />;
}
