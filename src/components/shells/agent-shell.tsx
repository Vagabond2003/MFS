"use client";

import { Banknote, Wallet } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { AccountStatusBadge } from "@/components/ui/badge";
import { AGENT_MOBILE, AGENT_NAV } from "@/config/navigation";
import { useApi } from "@/hooks/use-api";
import { useCurrentUser } from "@/hooks/use-auth";
import { api } from "@/services";
import { formatMoney } from "@/lib/utils";
import { MobileBottomNav, NotificationBell, SidebarNav, UserMenu, useThemeClass } from "./shared";

/**
 * Agent shell — an operations console: dark sidebar with an amber accent,
 * and a persistent float strip (e-money + physical cash) because every
 * counter operation depends on it.
 */
export function AgentShell({ children }: { children: React.ReactNode }) {
  useThemeClass("theme-agent");
  const user = useCurrentUser();
  const wallet = useApi(() => api.wallet.get(), [], { tags: ["wallet"] });

  return (
    <div className="theme-agent min-h-dvh bg-[#f3f4f6]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col bg-slate-950 text-white lg:flex">
        <div className="flex h-16 items-center gap-2 px-5">
          <Logo href="/dashboard/agent" tone="light" suffix={<span className="rounded-md bg-accent-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-fg">Agent</span>} />
        </div>
        <div className="mx-4 mb-2 rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="truncate text-sm font-semibold">{user.outletName ?? user.name}</p>
          <p className="tabular mt-0.5 text-xs text-slate-400">
            {user.agentCode} · {user.phone}
          </p>
          <div className="mt-2">
            <AccountStatusBadge status={user.status} />
          </div>
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto px-3 py-4">
          <SidebarNav sections={AGENT_NAV} tone="dark" />
        </div>
      </aside>

      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-30 bg-slate-950 text-white lg:bg-white lg:text-slate-900 lg:shadow-[0_1px_0_rgb(15_23_42/0.06)]">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="lg:hidden">
              <Logo href="/dashboard/agent" tone="light" />
            </div>
            <div className="hidden items-center gap-2 lg:flex" aria-label="Float balances">
              <FloatPill icon={<Wallet className="h-4 w-4" />} label="E-money" value={wallet.data ? formatMoney(wallet.data.available) : "—"} />
              <FloatPill icon={<Banknote className="h-4 w-4" />} label="Cash in hand" value={wallet.data?.cashInHand != null ? formatMoney(wallet.data.cashInHand) : "—"} />
            </div>
            <div className="flex items-center gap-1">
              <div className="lg:hidden">
                <NotificationBell tone="dark" />
              </div>
              <div className="hidden lg:block">
                <NotificationBell />
              </div>
              <UserMenu subtitle={`Agent · ${user.agentCode ?? ""}`} />
            </div>
          </div>
          {/* Mobile float strip */}
          <div className="grid grid-cols-2 gap-2 px-4 pb-3 lg:hidden">
            <div className="rounded-xl bg-white/10 px-3 py-2">
              <p className="text-[11px] text-slate-400">E-money</p>
              <p className="tabular text-sm font-bold">{wallet.data ? formatMoney(wallet.data.available) : "—"}</p>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2">
              <p className="text-[11px] text-slate-400">Cash in hand</p>
              <p className="tabular text-sm font-bold">{wallet.data?.cashInHand != null ? formatMoney(wallet.data.cashInHand) : "—"}</p>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12">{children}</main>
      </div>

      <MobileBottomNav items={AGENT_MOBILE.items} sheetTitle="Agent services" sheetItems={AGENT_MOBILE.more} tone="dark" />
    </div>
  );
}

function FloatPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent-100 text-accent-700">{icon}</span>
      <div className="leading-tight">
        <p className="text-[11px] font-medium text-slate-500">{label}</p>
        <p className="tabular text-sm font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
}
