import type { Role } from "@/types/domain";

/**
 * Route-level RBAC — the single source of truth used by BOTH:
 *   - src/proxy.ts (runs on the server before any route renders), and
 *   - the client AppFrame guard (defense in depth).
 *
 * Keep this file free of browser/Node-only APIs so it runs in either place.
 */

export const ROLE_HOME: Record<Role, string> = {
  PERSONAL: "/dashboard/personal",
  AGENT: "/dashboard/agent",
  MERCHANT: "/dashboard/merchant",
  ADMIN: "/admin",
};

export const ROLE_LABEL: Record<Role, string> = {
  PERSONAL: "Personal",
  AGENT: "Agent",
  MERCHANT: "Merchant",
  ADMIN: "Admin",
};

interface AccessRule {
  prefix: string;
  roles: readonly Role[];
}

const CUSTOMER_ROLES = ["PERSONAL", "AGENT", "MERCHANT"] as const;
const ALL_ROLES = ["PERSONAL", "AGENT", "MERCHANT", "ADMIN"] as const;

/** Ordered most-specific first. */
const PROTECTED_RULES: AccessRule[] = [
  { prefix: "/dashboard/personal", roles: ["PERSONAL"] },
  { prefix: "/dashboard/agent", roles: ["AGENT"] },
  { prefix: "/dashboard/merchant", roles: ["MERCHANT"] },
  { prefix: "/dashboard", roles: ALL_ROLES },
  { prefix: "/admin", roles: ["ADMIN"] },
  { prefix: "/transactions", roles: CUSTOMER_ROLES },
  { prefix: "/notifications", roles: ALL_ROLES },
  { prefix: "/profile", roles: ALL_ROLES },
];

/** Signed-in users are bounced from these to their dashboard. */
const GUEST_ONLY = ["/login", "/register", "/forgot-password"];

function matches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function findRule(pathname: string): AccessRule | null {
  return PROTECTED_RULES.find((r) => matches(pathname, r.prefix)) ?? null;
}

export function isProtectedPath(pathname: string) {
  return findRule(pathname) !== null;
}

export function isGuestOnlyPath(pathname: string) {
  return GUEST_ONLY.some((p) => matches(pathname, p));
}

export function canAccess(role: Role, pathname: string) {
  const rule = findRule(pathname);
  return rule ? rule.roles.includes(role) : true;
}

/**
 * Validates a post-login `next` parameter. Only same-origin relative paths the
 * role may access are honoured — prevents open redirects and cross-role jumps.
 */
export function safeNextPath(role: Role, next: string | null | undefined) {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return ROLE_HOME[role];
  }
  const pathname = next.split(/[?#]/)[0];
  if (pathname === "/dashboard" || isGuestOnlyPath(pathname)) return ROLE_HOME[role];
  return canAccess(role, pathname) && isProtectedPath(pathname) ? next : ROLE_HOME[role];
}
