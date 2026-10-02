import type { Metadata } from "next";
import { MerchantQrView } from "@/features/merchant/qr";

export const metadata: Metadata = { title: "QR Code" };

export default function Page() {
  return <MerchantQrView />;
}
