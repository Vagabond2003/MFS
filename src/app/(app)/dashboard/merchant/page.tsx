import type { Metadata } from "next";
import { MerchantDashboardView } from "@/features/merchant/dashboard";

export const metadata: Metadata = { title: "Business Overview" };

export default function Page() {
  return <MerchantDashboardView />;
}
