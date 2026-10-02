import {
  ArrowDownLeft,
  BadgeCheck,
  CircleCheck,
  CircleX,
  Landmark,
  Megaphone,
  Send,
  ShieldAlert,
  Store,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NotificationType } from "@/types/domain";

const MAP: Record<NotificationType, { icon: LucideIcon; className: string; label: string }> = {
  PAYMENT_SUCCESS: { icon: CircleCheck, className: "bg-emerald-50 text-emerald-600", label: "Payments" },
  PAYMENT_FAILED: { icon: CircleX, className: "bg-rose-50 text-rose-600", label: "Payments" },
  MONEY_RECEIVED: { icon: ArrowDownLeft, className: "bg-emerald-50 text-emerald-600", label: "Money in" },
  MONEY_SENT: { icon: Send, className: "bg-slate-100 text-slate-600", label: "Money out" },
  ACCOUNT_VERIFICATION: { icon: BadgeCheck, className: "bg-sky-50 text-sky-600", label: "Account" },
  SECURITY_ALERT: { icon: ShieldAlert, className: "bg-amber-50 text-amber-600", label: "Security" },
  MERCHANT_PAYMENT: { icon: Store, className: "bg-indigo-50 text-indigo-600", label: "Payments" },
  AGENT_SETTLEMENT: { icon: Landmark, className: "bg-violet-50 text-violet-600", label: "Settlement" },
  SYSTEM_ANNOUNCEMENT: { icon: Megaphone, className: "bg-slate-100 text-slate-600", label: "Announcements" },
};

export function notificationCategory(type: NotificationType) {
  return MAP[type].label;
}

export function NotificationIcon({ type, className }: { type: NotificationType; className?: string }) {
  const m = MAP[type];
  const Icon = m.icon;
  return (
    <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", m.className, className)} aria-hidden>
      <Icon className="h-[18px] w-[18px]" />
    </span>
  );
}
