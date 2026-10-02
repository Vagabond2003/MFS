import { RoleGate } from "@/components/guards/app-frame";

export default function PersonalLayout({ children }: { children: React.ReactNode }) {
  return <RoleGate allow={["PERSONAL"]}>{children}</RoleGate>;
}
