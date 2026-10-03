import { Suspense } from "react";
import { Unauthorized } from "@/features/auth/unauthorized";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Not authorised");

export default function UnauthorizedPage() {
  return (
    <Suspense>
      <Unauthorized />
    </Suspense>
  );
}
