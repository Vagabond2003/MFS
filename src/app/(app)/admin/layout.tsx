import { RoleGate } from "@/components/guards/app-frame";

/** Admin routes are protected separately from customer routes (proxy + this gate). */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <RoleGate allow={["ADMIN"]}>{children}</RoleGate>;
}
