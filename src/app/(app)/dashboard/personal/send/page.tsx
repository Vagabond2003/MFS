import { SendMoneyView } from "@/features/personal/flows";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Send Money");

export default function Page() {
  return <SendMoneyView />;
}
