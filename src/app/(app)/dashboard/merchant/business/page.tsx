import { BusinessProfileView } from "@/features/merchant/pages";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Business Profile");

export default function Page() {
  return <BusinessProfileView />;
}
