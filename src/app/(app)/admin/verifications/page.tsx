import type { Metadata } from "next";
import { AdminVerifications } from "@/features/admin/verifications";

export const metadata: Metadata = { title: "Verifications" };

export default function Page() {
  return <AdminVerifications />;
}
