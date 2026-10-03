import { ReceivePaymentView } from "@/features/merchant/qr";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Receive Payment");

export default function Page() {
  return <ReceivePaymentView />;
}
