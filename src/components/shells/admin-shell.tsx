"use client";

import { useState } from "react";
import { Menu, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Sheet } from "@/components/ui/modal";
import { ADMIN_NAV } from "@/config/navigation";
import { NotificationBell, SidebarNav, UserMenu, useThemeClass } from "./shared";

/** Admin shell — a compact back-office console, visually separate from customer apps. */
export function AdminShell({ children }: { children: React.ReactNode }) {
  useThemeClass("theme-admin");
  const [menu, setMenu] = useState(false);
  return (
    <div className="theme-admin min-h-dvh bg-slate-100">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-800 bg-slate-900 text-white lg:flex">
        <div className="flex h-14 items-center px-5">
          <Logo href="/admin" tone="light" suffix={<span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-300">Admin</span>} />
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto px-3 py-4">
          <SidebarNav sections={ADMIN_NAV} tone="dark" />
        </div>
        <div className="flex items-center gap-2 border-t border-white/10 px-5 py-3 text-xs text-slate-400">
          <ShieldCheck className="h-4 w-4 text-sky-400" aria-hidden /> All admin actions are audit-logged
        </div>
      </aside>
      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
          <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex items-center gap-2">
              <button type="button" className="grid h-10 w-10 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setMenu(true)} aria-label="Open navigation">
                <Menu className="h-5 w-5" />
              </button>
              <p className="text-sm font-semibold text-slate-900">Back-office console</p>
            </div>
            <div className="flex items-center gap-1">
              <NotificationBell />
              <UserMenu />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 pb-12 pt-6 sm:px-6">{children}</main>
      </div>
      <Sheet open={menu} onClose={() => setMenu(false)} title="Admin console" side="bottom">
        <SidebarNav sections={ADMIN_NAV} onNavigate={() => setMenu(false)} />
      </Sheet>
    </div>
  );
}
