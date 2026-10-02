import type { Metadata } from "next";
import { Suspense } from "react";
import { Unauthorized } from "@/features/auth/unauthorized";

export const metadata: Metadata = { title: "Not authorised" };

export default function UnauthorizedPage() {
  return (
    <Suspense>
      <Unauthorized />
    </Suspense>
  );
}
