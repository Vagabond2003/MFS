"use client";

import Link from "next/link";
import { useState } from "react";
import { BellOff, CheckCheck, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { Tabs } from "@/components/ui/data";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { invalidate, useApi } from "@/hooks/use-api";
import { api } from "@/services";
import { cn, formatRelative } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import { NotificationIcon, notificationCategory } from "./notification-icon";

export function NotificationsPage() {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [pageSize, setPageSize] = useState(20);
  const list = useApi(() => api.notifications.list({ unreadOnly: tab === "unread", page: 1, pageSize }), [tab, pageSize], { tags: ["notifications"] });
  const unread = useApi(() => api.notifications.unreadCount(), [], { tags: ["notifications"] });

  const markAll = async () => {
    await api.notifications.markAllRead();
    invalidate("notifications");
  };

  return (
    <div>
      <PageHeader
        title={t("Notifications")}
        description={t("Payments, account updates, security alerts and announcements.")}
        actions={
          <Button variant="outline" size="sm" onClick={markAll} disabled={!unread.data}>
            <CheckCheck className="h-4 w-4" aria-hidden /> {t("Mark all as read")}
          </Button>
        }
      />
      <Card>
        <div className="border-b border-slate-100 p-4">
          <Tabs
            ariaLabel={t("Filter notifications")}
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "all", label: t("All") },
              { value: "unread", label: t("Unread"), count: unread.data ?? 0 },
            ]}
            className="inline-flex"
          />
        </div>
        {list.error ? (
          <ErrorState message={list.error.message} onRetry={list.reload} />
        ) : list.loading ? (
          <div className="space-y-4 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : !list.data?.items.length ? (
          <EmptyState icon={<BellOff className="h-6 w-6" />} title={tab === "unread" ? t("No unread notifications") : t("No notifications yet")} description={t("We'll let you know about payments and account activity here.")} />
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {list.data.items.map((n) => {
                const body = (
                  <>
                    <NotificationIcon type={n.type} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <p className="text-sm font-semibold text-slate-900">{t(n.title)}</p>
                        <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{t(notificationCategory(n.type))}</span>
                      </div>
                      <p className="mt-0.5 text-sm text-slate-600">{t(n.body)}</p>
                      <p className="mt-1 text-xs text-slate-400">{formatRelative(n.createdAt, lang)}</p>
                    </div>
                    {!n.read && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent-600" aria-label={t("Unread")} />}
                    {n.link && <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" aria-hidden />}
                  </>
                );
                const onOpen = () => {
                  if (!n.read) void api.notifications.markRead(n.id).then(() => invalidate("notifications"));
                };
                return (
                  <li key={n.id} className={cn(!n.read && "bg-accent-50/40")}>
                    {n.link ? (
                      <Link href={n.link} onClick={onOpen} className="flex gap-3 px-5 py-4 transition hover:bg-slate-50 sm:px-6">
                        {body}
                      </Link>
                    ) : (
                      <button type="button" onClick={onOpen} className="flex w-full gap-3 px-5 py-4 text-left transition hover:bg-slate-50 sm:px-6">
                        {body}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {list.data.total > list.data.items.length && (
              <div className="border-t border-slate-100 p-4 text-center">
                <Button variant="ghost" onClick={() => setPageSize((s) => s + 20)} loading={list.refreshing}>
                  {t("Load more")}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
