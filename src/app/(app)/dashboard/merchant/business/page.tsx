import type { Metadata } from "next";
import { BusinessProfileView } from "@/features/merchant/pages";

export const metadata: Metadata = { title: "Business Profile" };

export default function Page() {
  return <BusinessProfileView />;
}
