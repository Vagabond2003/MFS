"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PageLoader } from "@/components/ui/feedback";
import { useAuth } from "@/hooks/use-auth";
import { ROLE_HOME } from "@/lib/auth/access";

/** /dashboard → the signed-in user's own dashboard (the proxy normally handles this first). */
export default function DashboardIndex() {
  const { user } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (user) router.replace(ROLE_HOME[user.role]);
  }, [user, router]);
  return <PageLoader label="Opening your dashboard…" />;
}
