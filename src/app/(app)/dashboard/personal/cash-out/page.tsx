import { CashOutView } from "@/features/personal/flows";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Cash Out");

export default function Page() {
  return <CashOutView />;
}
