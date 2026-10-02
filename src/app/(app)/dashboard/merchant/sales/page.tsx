import type { Metadata } from "next";
import { SalesAnalyticsView } from "@/features/merchant/pages";

export const metadata: Metadata = { title: "Sales Analytics" };

export default function Page() {
  return <SalesAnalyticsView />;
}
