"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { AccountStatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { MERCHANT_MOBILE, MERCHANT_NAV, isActive } from "@/config/navigation";
import { useCurrentUser } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { DemoBanner, MobileBottomNav, NotificationBell, UserMenu, useThemeClass } from "./shared";

/**
 * Merchant shell — a business suite: no sidebar; a top bar carrying the
 * business identity (name, Merchant ID, verification) and horizontal
 * section tabs, with "Receive payment" always one click away.
 */
export function MerchantShell({ children }: { children: React.ReactNode }) {
  useThemeClass("theme-merchant");
  const user = useCurrentUser();
  const pathname = usePathname();

  return (
    <div className="theme-merchant min-h-dvh bg-[#f5f5fb]">
      <DemoBanner />
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <Logo href="/dashboard/merchant" suffix={<span className="hidden rounded-md bg-accent-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-700 sm:inline">Business</span>} />
            <div className="hidden h-8 w-px bg-slate-200 md:block" />
            <div className="hidden min-w-0 md:block">
              <p className="truncate text-sm font-semibold text-slate-900">{user.businessName}</p>
              <p className="tabular text-xs text-slate-500">Merchant ID {user.merchantId}</p>
            </div>
            <div className="hidden xl:block">
              <AccountStatusBadge status={user.status} />
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <ButtonLink href="/dashboard/merchant/receive" size="sm" className="hidden sm:inline-flex">
              <Plus className="h-4 w-4" aria-hidden /> Receive payment
            </ButtonLink>
            <NotificationBell />
            <UserMenu subtitle={`Owner · ${user.name}`} />
          </div>
        </div>
        <nav aria-label="Business sections" className="no-scrollbar mx-auto hidden max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6 lg:flex lg:px-8">
          {MERCHANT_NAV.map((item) => {
            const active = isActive(pathname, item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition",
                  active ? "border-accent-600 text-accent-700" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12">{children}</main>
      <MobileBottomNav items={MERCHANT_MOBILE.items} sheetTitle="Business tools" sheetItems={MERCHANT_MOBILE.more} />
    </div>
  );
}
