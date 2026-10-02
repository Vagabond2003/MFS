import type { Metadata } from "next";
import { RefundsView } from "@/features/merchant/pages";

export const metadata: Metadata = { title: "Refunds" };

export default function Page() {
  return <RefundsView />;
}
