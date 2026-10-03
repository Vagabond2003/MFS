import { MerchantQrView } from "@/features/merchant/qr";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("QR Code");

export default function Page() {
  return <MerchantQrView />;
}
