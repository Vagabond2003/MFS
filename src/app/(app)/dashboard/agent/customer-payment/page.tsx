import type { Metadata } from "next";
import { AgentCustomerPaymentView } from "@/features/agent/flows";

export const metadata: Metadata = { title: "Customer Payment" };

export default function Page() {
  return <AgentCustomerPaymentView />;
}
