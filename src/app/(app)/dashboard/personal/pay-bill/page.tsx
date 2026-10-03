import { PayBillView } from "@/features/personal/flows";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Pay Bill");

export default function Page() {
  return <PayBillView />;
}
