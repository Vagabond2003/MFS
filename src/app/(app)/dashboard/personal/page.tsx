import type { Metadata } from "next";
import { PersonalDashboardView } from "@/features/personal/dashboard";

export const metadata: Metadata = { title: "Home" };

export default function Page() {
  return <PersonalDashboardView />;
}
