import { AddMoneyView } from "@/features/personal/flows";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Add Money");

export default function Page() {
  return <AddMoneyView />;
}
