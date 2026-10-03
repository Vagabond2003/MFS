import { MerchantRegistration } from "@/features/register/merchant-form";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Merchant account");

export default function Page() {
  return <MerchantRegistration />;
}
