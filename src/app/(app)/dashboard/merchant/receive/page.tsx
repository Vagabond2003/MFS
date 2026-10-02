import type { Metadata } from "next";
import { ReceivePaymentView } from "@/features/merchant/qr";

export const metadata: Metadata = { title: "Receive Payment" };

export default function Page() {
  return <ReceivePaymentView />;
}
