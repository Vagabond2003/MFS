import { RechargeView } from "@/features/personal/flows";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Mobile Recharge");

export default function Page() {
  return <RechargeView />;
}
