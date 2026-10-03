import { AgentVerificationView } from "@/features/agent/pages";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Agent verification");

export default function Page() {
  return <AgentVerificationView />;
}
