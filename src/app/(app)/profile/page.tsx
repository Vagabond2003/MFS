import { ProfilePage } from "@/features/profile/profile-page";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Profile & Security");

export default function Page() {
  return <ProfilePage />;
}
