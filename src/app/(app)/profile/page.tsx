import type { Metadata } from "next";
import { ProfilePage } from "@/features/profile/profile-page";

export const metadata: Metadata = { title: "Profile & Security" };

export default function Page() {
  return <ProfilePage />;
}
