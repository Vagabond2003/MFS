"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { FullScreenLoader } from "@/components/ui/feedback";
import { AdminShell } from "@/components/shells/admin-shell";
import { AgentShell } from "@/components/shells/agent-shell";
import { MerchantShell } from "@/components/shells/merchant-shell";
import { PersonalShell } from "@/components/shells/personal-shell";
import { useAuth } from "@/hooks/use-auth";
import { canAccess } from "@/lib/auth/access";
import type { Role } from "@/types/domain";

const SHELLS: Record<Role, React.ComponentType<{ children: React.ReactNode }>> = {
  PERSONAL: PersonalShell,
  AGENT: AgentShell,
  MERCHANT: MerchantShell,
  ADMIN: AdminShell,
};

/**
 * Client-side guard for every authenticated route (defense in depth behind
 * src/proxy.ts). The role used here comes from the API's session lookup,
 * not from the cookie, so a tampered cookie still lands on 403.
 */
export function AppFrame({ children }: { children: React.ReactNode }) {
  const { status, user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const allowed = !!user && canAccess(user.role, pathname);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    } else if (status === "authenticated" && user && !canAccess(user.role, pathname)) {
      router.replace(`/unauthorized?from=${encodeURIComponent(pathname)}`);
    }
  }, [status, user, pathname, router]);

  if (status !== "authenticated" || !user) return <FullScreenLoader label="Checking your session…" />;
  if (!allowed) return <FullScreenLoader label="Checking permissions…" />;

  const Shell = SHELLS[user.role];
  return <Shell>{children}</Shell>;
}

/** Explicit per-area gate used by role layouts. */
export function RoleGate({ allow, children }: { allow: Role[]; children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const ok = !!user && allow.includes(user.role);
  useEffect(() => {
    if (user && !allow.includes(user.role)) router.replace(`/unauthorized?from=${encodeURIComponent(pathname)}`);
  }, [user, allow, router, pathname]);
  return ok ? <>{children}</> : null;
}
