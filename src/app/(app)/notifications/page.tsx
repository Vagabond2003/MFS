import { NotificationsPage } from "@/features/shared/notifications-page";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Notifications");

export default function Page() {
  return <NotificationsPage />;
}
