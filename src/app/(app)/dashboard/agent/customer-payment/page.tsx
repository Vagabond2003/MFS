import { AgentCustomerPaymentView } from "@/features/agent/flows";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Customer Payment");

export default function Page() {
  return <AgentCustomerPaymentView />;
}
