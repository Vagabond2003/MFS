import type { Metadata } from "next";
import { PayBillView } from "@/features/personal/flows";

export const metadata: Metadata = { title: "Pay Bill" };

export default function Page() {
  return <PayBillView />;
}
