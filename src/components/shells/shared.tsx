"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, CheckCheck, LogOut, MonitorSmartphone, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Popover } from "@/components/ui/popover";
import { ConfirmDialog, Sheet } from "@/components/ui/modal";
import { DemoBadge } from "@/components/ui/badge";
import { invalidate, useApi } from "@/hooks/use-api";
import { useAuth, useCurrentUser } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { api, errorMessage } from "@/services";
import { ROLE_LABEL } from "@/lib/auth/access";
import { cn, formatRelative } from "@/lib/utils";
import { isActive, type NavItem, type NavSection } from "@/config/navigation";
import { NotificationIcon } from "@/features/shared/notification-icon";

/** Applies the role accent to <body> so portalled UI (modals, toasts) matches. */
export function useThemeClass(theme: string) {
  useEffect(() => {
    document.body.classList.add(theme);
    return () => document.body.classList.remove(theme);
  }, [theme]);
}

/* ───────────── Notification bell ───────────── */

export function NotificationBell({ tone = "light" }: { tone?: "light" | "dark" }) {
  const { t } = useI18n();
  const router = useRouter();
  const count = useApi(() => api.notifications.unreadCount(), [], { tags: ["notifications"], pollMs: 30_000 });
  const unread = count.data ?? 0;

  return (
    <Popover
      label={t("Notifications")}
      className="w-[min(92vw,380px)]"
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label={unread ? t("Notifications, {n} unread", { n: unread }) : t("Notifications")}
          className={cn(
            "relative grid h-10 w-10 place-items-center rounded-xl transition",
            tone === "dark" ? "text-slate-300 hover:bg-white/10 hover:text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
          )}
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="tabular absolute right-1 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      )}
    >
      {(close) => <NotificationPreview close={close} onOpenAll={() => router.push("/notifications")} />}
    </Popover>
  );
}

function NotificationPreview({ close, onOpenAll }: { close: () => void; onOpenAll: () => void }) {
  const { t, lang } = useI18n();
  const list = useApi(() => api.notifications.list({ page: 1, pageSize: 6 }), [], { tags: ["notifications"] });
  return (
    <div>
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <p className="text-sm font-semibold text-slate-900">{t("Notifications")}</p>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs font-semibold text-accent-700 hover:underline"
          onClick={async () => {
            await api.notifications.markAllRead();
            invalidate("notifications");
          }}
        >
          <CheckCheck className="h-3.5 w-3.5" aria-hidden /> {t("Mark all read")}
        </button>
      </div>
      <ul className="scroll-thin max-h-96 divide-y divide-slate-100 overflow-y-auto">
        {list.loading && <li className="px-4 py-6 text-center text-sm text-slate-500">{t("Loading…")}</li>}
        {list.data?.items.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-500">{t("You're all caught up.")}</li>}
        {list.data?.items.map((n) => (
          <li key={n.id}>
            <Link
              href={n.link ?? "/notifications"}
              onClick={() => {
                close();
                if (!n.read) void api.notifications.markRead(n.id).then(() => invalidate("notifications"));
              }}
              className={cn("flex gap-3 px-4 py-3 transition hover:bg-slate-50", !n.read && "bg-accent-50/40")}
            >
              <NotificationIcon type={n.type} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <span className="truncate">{t(n.title)}</span>
                  {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-accent-600" aria-label={t("Unread")} />}
                </p>
                <p className="line-clamp-2 text-xs text-slate-500">{t(n.body)}</p>
                <p className="mt-1 text-[11px] text-slate-400">{formatRelative(n.createdAt, lang)}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => {
          close();
          onOpenAll();
        }}
        className="w-full border-t border-slate-100 py-2.5 text-center text-sm font-semibold text-accent-700 hover:bg-slate-50"
      >
        {t("View all notifications")}
      </button>
    </div>
  );
}

/* ───────────── User menu ───────────── */

export function UserMenu({ tone = "light", subtitle }: { tone?: "light" | "dark"; subtitle?: string }) {
  const { t } = useI18n();
  const user = useCurrentUser();
  const { signOut } = useAuth();
  const [confirmAll, setConfirmAll] = useState(false);
  const displayName = user.businessName ?? user.name;

  return (
    <>
      <Popover
        label={t("Account menu")}
        className="w-72"
        trigger={({ toggle, open }) => (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-label={t("Account menu")}
            className={cn("flex items-center gap-2.5 rounded-xl p-1 pr-2 transition", tone === "dark" ? "hover:bg-white/10" : "hover:bg-slate-100")}
          >
            <Avatar name={displayName} />
            <span className="hidden min-w-0 text-left lg:block">
              <span className={cn("block max-w-36 truncate text-sm font-semibold", tone === "dark" ? "text-white" : "text-slate-900")}>{displayName}</span>
              <span className={cn("block text-xs", tone === "dark" ? "text-slate-400" : "text-slate-500")}>{subtitle ?? t("{role} account", { role: t(ROLE_LABEL[user.role]) })}</span>
            </span>
          </button>
        )}
      >
        {(close) => (
          <div>
            <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4">
              <Avatar name={displayName} className="h-11 w-11" />
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate font-semibold text-slate-900">
                  <span className="truncate">{displayName}</span>
                  {user.isDemo && <DemoBadge />}
                </p>
                <p className="tabular truncate text-xs text-slate-500">{user.phone}</p>
                <p className="mt-0.5 text-xs font-medium text-accent-700">{t("{role} account", { role: t(ROLE_LABEL[user.role]) })}</p>
              </div>
            </div>
            <div className="p-1.5">
              <Link href="/profile" onClick={close} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
                <UserRound className="h-4 w-4 text-slate-400" aria-hidden /> {t("Profile & security")}
              </Link>
              <Link href="/profile?tab=sessions" onClick={close} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
                <MonitorSmartphone className="h-4 w-4 text-slate-400" aria-hidden /> {t("Devices & sessions")}
              </Link>
            </div>
            <div className="border-t border-slate-100 p-1.5">
              <button type="button" onClick={() => { close(); void signOut(); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                <LogOut className="h-4 w-4 text-slate-400" aria-hidden /> {t("Sign out")}
              </button>
              <button type="button" onClick={() => { close(); setConfirmAll(true); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50">
                <LogOut className="h-4 w-4" aria-hidden /> {t("Sign out of all devices")}
              </button>
            </div>
          </div>
        )}
      </Popover>
      <ConfirmDialog
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        title={t("Sign out everywhere?")}
        description={t("This ends every active session for your account, including this one.")}
        confirmLabel={t("Sign out all devices")}
        tone="danger"
        onConfirm={async () => {
          try {
            await signOut({ everywhere: true });
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </>
  );
}

/* ───────────── Sidebar nav list ───────────── */

export function SidebarNav({ sections, tone = "light", onNavigate }: { sections: NavSection[]; tone?: "light" | "dark"; onNavigate?: () => void }) {
  const { t } = useI18n();
  const pathname = usePathname();
  return (
    <nav className="space-y-6" aria-label={t("Main")}>
      {sections.map((section, i) => (
        <div key={section.title ?? i}>
          {section.title && (
            <p className={cn("mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider", tone === "dark" ? "text-slate-500" : "text-slate-400")}>{t(section.title)}</p>
          )}
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = isActive(pathname, item);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
                      tone === "dark"
                        ? active
                          ? "bg-accent-600 text-accent-fg"
                          : "text-slate-300 hover:bg-white/5 hover:text-white"
                        : active
                          ? "bg-accent-50 text-accent-700"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                    )}
                  >
                    <Icon className={cn("h-[18px] w-[18px] shrink-0", !active && (tone === "dark" ? "text-slate-500 group-hover:text-slate-300" : "text-slate-400 group-hover:text-slate-600"))} aria-hidden />
                    {t(item.label)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/* ───────────── Mobile bottom navigation ───────────── */

export function MobileBottomNav({
  items,
  center,
  sheetTitle,
  sheetItems,
  tone = "light",
}: {
  items: NavItem[];
  center?: { label: string; icon: NavItem["icon"] };
  sheetTitle: string;
  sheetItems: NavItem[];
  tone?: "light" | "dark";
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const left = center ? items.slice(0, 2) : items;
  const right = center ? items.slice(2) : [];
  const CenterIcon = center?.icon;

  const tab = (item: NavItem) => {
    const active = isActive(pathname, item);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition",
          active ? (tone === "dark" ? "text-accent-500" : "text-accent-700") : tone === "dark" ? "text-slate-400" : "text-slate-500",
        )}
      >
        <Icon className="h-[22px] w-[22px]" aria-hidden />
        {t(item.label)}
      </Link>
    );
  };

  return (
    <>
      <nav
        aria-label={t("Primary")}
        className={cn(
          "no-print fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] lg:hidden",
          tone === "dark" ? "border-white/10 bg-slate-950/95 backdrop-blur" : "border-slate-200 bg-white/95 backdrop-blur",
        )}
      >
        <div className="mx-auto flex max-w-lg items-end px-2">
          {left.map(tab)}
          {center && CenterIcon ? (
            <button type="button" onClick={() => setOpen(true)} className="flex flex-1 flex-col items-center gap-0.5 pb-2 text-[11px] font-semibold text-slate-600" aria-haspopup="dialog">
              <span className="-mt-5 grid h-14 w-14 place-items-center rounded-2xl bg-accent-600 text-accent-fg shadow-lg ring-4 ring-white">
                <CenterIcon className="h-6 w-6" aria-hidden />
              </span>
              {t(center.label)}
            </button>
          ) : null}
          {right.map(tab)}
          {!center && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              className={cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold", tone === "dark" ? "text-slate-400" : "text-slate-500")}
            >
              <span className="grid h-[22px] w-[22px] grid-cols-2 gap-0.5 p-0.5" aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className="rounded-[2px] bg-current" />
                ))}
              </span>
              {t("More")}
            </button>
          )}
        </div>
      </nav>
      <Sheet open={open} onClose={() => setOpen(false)} title={sheetTitle} side="bottom">
        <ul className="grid grid-cols-3 gap-3">
          {sheetItems.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link href={item.href} onClick={() => setOpen(false)} className="flex flex-col items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-2 py-4 text-center text-xs font-semibold text-slate-700 active:bg-slate-100">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-100 text-accent-700">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  {t(item.label)}
                </Link>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </>
  );
}
