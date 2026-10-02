import type { Metadata } from "next";
import { CashOutView } from "@/features/personal/flows";

export const metadata: Metadata = { title: "Cash Out" };

export default function Page() {
  return <CashOutView />;
}
