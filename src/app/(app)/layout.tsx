import { AppFrame } from "@/components/guards/app-frame";

/** Every route in this group requires a session (enforced in src/proxy.ts and AppFrame). */
export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return <AppFrame>{children}</AppFrame>;
}
