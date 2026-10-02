import type { Metadata } from "next";
import { MerchantPayView } from "@/features/personal/flows";

export const metadata: Metadata = { title: "Merchant Payment" };

export default function Page() {
  return <MerchantPayView />;
}
