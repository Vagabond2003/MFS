import type { Metadata } from "next";
import { RechargeView } from "@/features/personal/flows";

export const metadata: Metadata = { title: "Mobile Recharge" };

export default function Page() {
  return <RechargeView />;
}
