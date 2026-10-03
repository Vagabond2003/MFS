import { RefundsView } from "@/features/merchant/pages";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Refunds");

export default function Page() {
  return <RefundsView />;
}
