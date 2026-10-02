import { RoleGate } from "@/components/guards/app-frame";

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return <RoleGate allow={["AGENT"]}>{children}</RoleGate>;
}
