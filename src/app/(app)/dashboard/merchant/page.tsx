import { MerchantDashboardView } from "@/features/merchant/dashboard";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Business Overview");

export default function Page() {
  return <MerchantDashboardView />;
}
