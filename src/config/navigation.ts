import {
  ArrowDownToLine,
  BadgeCheck,
  Banknote,
  Bell,
  Building,
  ChartColumnBig,
  CirclePlus,
  ClipboardList,
  FileClock,
  Gavel,
  House,
  Landmark,
  LayoutDashboard,
  Percent,
  QrCode,
  ReceiptText,
  RotateCcw,
  ScanQrCode,
  ScrollText,
  Send,
  Smartphone,
  Store,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { msg } from "@/lib/i18n/core";

export interface NavItem {
  href: string;
  /** English — rendered with `t()`. */
  label: string;
  icon: LucideIcon;
  /** Only active on an exact path match (used for "home" items). */
  exact?: boolean;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/* ───────────── Personal ───────────── */

export const PERSONAL_NAV: NavSection[] = [
  { items: [{ href: "/dashboard/personal", label: msg("Home"), icon: House, exact: true }] },
  {
    title: msg("Money"),
    items: [
      { href: "/dashboard/personal/send", label: msg("Send Money"), icon: Send },
      { href: "/dashboard/personal/cash-out", label: msg("Cash Out"), icon: Banknote },
      { href: "/dashboard/personal/add-money", label: msg("Add Money"), icon: CirclePlus },
    ],
  },
  {
    title: msg("Payments"),
    items: [
      { href: "/dashboard/personal/merchant-pay", label: msg("Merchant Pay"), icon: Store },
      { href: "/dashboard/personal/pay-bill", label: msg("Pay Bill"), icon: ReceiptText },
      { href: "/dashboard/personal/recharge", label: msg("Mobile Recharge"), icon: Smartphone },
    ],
  },
  {
    title: msg("Account"),
    items: [
      { href: "/transactions", label: msg("Transactions"), icon: FileClock },
      { href: "/notifications", label: msg("Notifications"), icon: Bell },
      { href: "/profile", label: msg("Profile & Security"), icon: UserRound },
    ],
  },
];

export const PERSONAL_MOBILE = {
  items: [
    { href: "/dashboard/personal", label: msg("Home"), icon: House, exact: true },
    { href: "/dashboard/personal/send", label: msg("Send"), icon: Send },
    { href: "/transactions", label: msg("History"), icon: FileClock },
    { href: "/profile", label: msg("Profile"), icon: UserRound },
  ] as NavItem[],
  center: { label: msg("Pay"), icon: ScanQrCode },
  sheet: [
    { href: "/dashboard/personal/merchant-pay", label: msg("Merchant Pay"), icon: Store },
    { href: "/dashboard/personal/cash-out", label: msg("Cash Out"), icon: Banknote },
    { href: "/dashboard/personal/recharge", label: msg("Recharge"), icon: Smartphone },
    { href: "/dashboard/personal/pay-bill", label: msg("Pay Bill"), icon: ReceiptText },
    { href: "/dashboard/personal/add-money", label: msg("Add Money"), icon: CirclePlus },
    { href: "/dashboard/personal/send", label: msg("Send Money"), icon: Send },
  ] as NavItem[],
};

/* ───────────── Agent ───────────── */

export const AGENT_NAV: NavSection[] = [
  { items: [{ href: "/dashboard/agent", label: msg("Agent Home"), icon: LayoutDashboard, exact: true }] },
  {
    title: msg("Counter"),
    items: [
      { href: "/dashboard/agent/cash-in", label: msg("Cash In"), icon: ArrowDownToLine },
      { href: "/dashboard/agent/cash-out", label: msg("Cash Out"), icon: Banknote },
      { href: "/dashboard/agent/recharge", label: msg("Mobile Recharge"), icon: Smartphone },
      { href: "/dashboard/agent/customer-payment", label: msg("Customer Payment"), icon: ReceiptText },
    ],
  },
  {
    title: msg("Business"),
    items: [
      { href: "/transactions", label: msg("Transactions"), icon: FileClock },
      { href: "/dashboard/agent/commission", label: msg("Commission"), icon: Percent },
      { href: "/dashboard/agent/settlement", label: msg("Settlement"), icon: Landmark },
      { href: "/dashboard/agent/verification", label: msg("Verification"), icon: BadgeCheck },
    ],
  },
  {
    title: msg("Account"),
    items: [
      { href: "/notifications", label: msg("Notifications"), icon: Bell },
      { href: "/profile", label: msg("Profile & Security"), icon: UserRound },
    ],
  },
];

export const AGENT_MOBILE = {
  items: [
    { href: "/dashboard/agent", label: msg("Home"), icon: LayoutDashboard, exact: true },
    { href: "/dashboard/agent/cash-in", label: msg("Cash In"), icon: ArrowDownToLine },
    { href: "/dashboard/agent/cash-out", label: msg("Cash Out"), icon: Banknote },
    { href: "/dashboard/agent/recharge", label: msg("Recharge"), icon: Smartphone },
  ] as NavItem[],
  more: [
    { href: "/transactions", label: msg("Transactions"), icon: FileClock },
    { href: "/dashboard/agent/commission", label: msg("Commission"), icon: Percent },
    { href: "/dashboard/agent/settlement", label: msg("Settlement"), icon: Landmark },
    { href: "/dashboard/agent/customer-payment", label: msg("Customer Payment"), icon: ReceiptText },
    { href: "/dashboard/agent/verification", label: msg("Verification"), icon: BadgeCheck },
    { href: "/profile", label: msg("Profile"), icon: UserRound },
  ] as NavItem[],
};

/* ───────────── Merchant ───────────── */

export const MERCHANT_NAV: NavItem[] = [
  { href: "/dashboard/merchant", label: msg("Overview"), icon: LayoutDashboard, exact: true },
  { href: "/dashboard/merchant/receive", label: msg("Receive Payment"), icon: Wallet },
  { href: "/dashboard/merchant/qr", label: msg("QR Code"), icon: QrCode },
  { href: "/dashboard/merchant/sales", label: msg("Sales"), icon: ChartColumnBig },
  { href: "/transactions", label: msg("Payments"), icon: FileClock },
  { href: "/dashboard/merchant/refunds", label: msg("Refunds"), icon: RotateCcw },
  { href: "/dashboard/merchant/settlement", label: msg("Settlement"), icon: Landmark },
  { href: "/dashboard/merchant/business", label: msg("Business"), icon: Building },
];

export const MERCHANT_MOBILE = {
  items: [
    { href: "/dashboard/merchant", label: msg("Home"), icon: LayoutDashboard, exact: true },
    { href: "/dashboard/merchant/receive", label: msg("Receive"), icon: Wallet },
    { href: "/dashboard/merchant/qr", label: msg("QR"), icon: QrCode },
    { href: "/dashboard/merchant/sales", label: msg("Sales"), icon: ChartColumnBig },
  ] as NavItem[],
  more: [
    { href: "/transactions", label: msg("Transactions"), icon: FileClock },
    { href: "/dashboard/merchant/settlement", label: msg("Settlement"), icon: Landmark },
    { href: "/dashboard/merchant/refunds", label: msg("Refunds"), icon: RotateCcw },
    { href: "/dashboard/merchant/business", label: msg("Business"), icon: Building },
    { href: "/notifications", label: msg("Notifications"), icon: Bell },
    { href: "/profile", label: msg("Profile"), icon: UserRound },
  ] as NavItem[],
};

/* ───────────── Admin ───────────── */

export const ADMIN_NAV: NavSection[] = [
  {
    items: [
      { href: "/admin", label: msg("Overview"), icon: LayoutDashboard, exact: true },
      { href: "/admin/verifications", label: msg("Verifications"), icon: BadgeCheck },
      { href: "/admin/users", label: msg("Users"), icon: Users },
      { href: "/admin/transactions", label: msg("Transactions"), icon: ClipboardList },
      { href: "/admin/disputes", label: msg("Disputes"), icon: Gavel },
      { href: "/admin/audit-logs", label: msg("Audit logs"), icon: ScrollText },
    ],
  },
  { title: msg("Account"), items: [{ href: "/profile", label: msg("My profile"), icon: UserRound }] },
];
