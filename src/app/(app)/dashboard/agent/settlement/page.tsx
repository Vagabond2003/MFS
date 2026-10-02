import type { Metadata } from "next";
import { SettlementPage } from "@/features/shared/settlement";

export const metadata: Metadata = { title: "Settlement" };

export default function Page() {
  return <SettlementPage role="AGENT" />;
}
