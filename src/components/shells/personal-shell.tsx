"use client";

import Link from "next/link";
import { Headphones } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { PERSONAL_MOBILE, PERSONAL_NAV } from "@/config/navigation";
import { useCurrentUser } from "@/hooks/use-auth";
import { DemoBanner, MobileBottomNav, NotificationBell, SidebarNav, UserMenu, useThemeClass } from "./shared";

/**
 * Personal customer shell — light, consumer-friendly: a calm sidebar grouped
 * by money tasks on desktop; a bottom tab bar with a central "Pay" action on
 * mobile.
 */
export function PersonalShell({ children }: { children: React.ReactNode }) {
  useThemeClass("theme-personal");
  const user = useCurrentUser();
  return (
    <div className="theme-personal min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200/80 bg-white lg:flex">
        <div className="flex h-16 items-center px-6">
          <Logo href="/dashboard/personal" />
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto px-3 py-4">
          <SidebarNav sections={PERSONAL_NAV} />
        </div>
        <div className="m-3 rounded-2xl bg-gradient-to-br from-brand-50 to-white p-4 ring-1 ring-brand-100">
          <p className="text-sm font-semibold text-slate-900">Need help?</p>
          <p className="mt-1 text-xs text-slate-500">24/7 support for payments and account issues.</p>
          <Link href="/help" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline">
            <Headphones className="h-3.5 w-3.5" aria-hidden /> Help center
          </Link>
        </div>
      </aside>

      <div className="lg:pl-64">
        <DemoBanner />
        <header className="sticky top-0 z-30 border-b border-slate-200/60 bg-canvas/85 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="lg:hidden">
              <Logo href="/dashboard/personal" />
            </div>
            <p className="hidden text-sm text-slate-500 lg:block">
              Wallet <span className="tabular font-medium text-slate-700">{user.phone}</span>
            </p>
            <div className="flex items-center gap-1">
              <NotificationBell />
              <UserMenu />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12">{children}</main>
      </div>

      <MobileBottomNav items={PERSONAL_MOBILE.items} center={PERSONAL_MOBILE.center} sheetTitle="Payments & services" sheetItems={PERSONAL_MOBILE.sheet} />
    </div>
  );
}
