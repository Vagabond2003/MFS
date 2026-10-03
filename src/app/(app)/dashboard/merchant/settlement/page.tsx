import { SettlementPage } from "@/features/shared/settlement";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Settlement");

export default function Page() {
  return <SettlementPage role="MERCHANT" />;
}
