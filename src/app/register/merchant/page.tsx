import type { Metadata } from "next";
import { MerchantRegistration } from "@/features/register/merchant-form";

export const metadata: Metadata = { title: "Merchant account" };

export default function Page() {
  return <MerchantRegistration />;
}
