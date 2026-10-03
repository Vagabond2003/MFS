import { SalesAnalyticsView } from "@/features/merchant/pages";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Sales Analytics");

export default function Page() {
  return <SalesAnalyticsView />;
}
