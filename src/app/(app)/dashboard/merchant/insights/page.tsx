import { MerchantInsightsView } from "@/features/insights/merchant";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Business insights");

export default function Page() {
  return <MerchantInsightsView />;
}
