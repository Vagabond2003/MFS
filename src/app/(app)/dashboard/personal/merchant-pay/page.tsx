import { MerchantPayView } from "@/features/personal/flows";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Merchant Payment");

export default function Page() {
  return <MerchantPayView />;
}
