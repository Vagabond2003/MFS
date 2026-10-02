import { RoleGate } from "@/components/guards/app-frame";

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  return <RoleGate allow={["MERCHANT"]}>{children}</RoleGate>;
}
