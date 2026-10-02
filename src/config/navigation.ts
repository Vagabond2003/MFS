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

export interface NavItem {
  href: string;
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
  { items: [{ href: "/dashboard/personal", label: "Home", icon: House, exact: true }] },
  {
    title: "Money",
    items: [
      { href: "/dashboard/personal/send", label: "Send Money", icon: Send },
      { href: "/dashboard/personal/cash-out", label: "Cash Out", icon: Banknote },
      { href: "/dashboard/personal/add-money", label: "Add Money", icon: CirclePlus },
    ],
  },
  {
    title: "Payments",
    items: [
      { href: "/dashboard/personal/merchant-pay", label: "Merchant Pay", icon: Store },
      { href: "/dashboard/personal/pay-bill", label: "Pay Bill", icon: ReceiptText },
      { href: "/dashboard/personal/recharge", label: "Mobile Recharge", icon: Smartphone },
    ],
  },
  {
    title: "Account",
    items: [
      { href: "/transactions", label: "Transactions", icon: FileClock },
      { href: "/notifications", label: "Notifications", icon: Bell },
      { href: "/profile", label: "Profile & Security", icon: UserRound },
    ],
  },
];

export const PERSONAL_MOBILE = {
  items: [
    { href: "/dashboard/personal", label: "Home", icon: House, exact: true },
    { href: "/dashboard/personal/send", label: "Send", icon: Send },
    { href: "/transactions", label: "History", icon: FileClock },
    { href: "/profile", label: "Profile", icon: UserRound },
  ] as NavItem[],
  center: { label: "Pay", icon: ScanQrCode },
  sheet: [
    { href: "/dashboard/personal/merchant-pay", label: "Merchant Pay", icon: Store },
    { href: "/dashboard/personal/cash-out", label: "Cash Out", icon: Banknote },
    { href: "/dashboard/personal/recharge", label: "Recharge", icon: Smartphone },
    { href: "/dashboard/personal/pay-bill", label: "Pay Bill", icon: ReceiptText },
    { href: "/dashboard/personal/add-money", label: "Add Money", icon: CirclePlus },
    { href: "/dashboard/personal/send", label: "Send Money", icon: Send },
  ] as NavItem[],
};

/* ───────────── Agent ───────────── */

export const AGENT_NAV: NavSection[] = [
  { items: [{ href: "/dashboard/agent", label: "Agent Home", icon: LayoutDashboard, exact: true }] },
  {
    title: "Counter",
    items: [
      { href: "/dashboard/agent/cash-in", label: "Cash In", icon: ArrowDownToLine },
      { href: "/dashboard/agent/cash-out", label: "Cash Out", icon: Banknote },
      { href: "/dashboard/agent/recharge", label: "Mobile Recharge", icon: Smartphone },
      { href: "/dashboard/agent/customer-payment", label: "Customer Payment", icon: ReceiptText },
    ],
  },
  {
    title: "Business",
    items: [
      { href: "/transactions", label: "Transactions", icon: FileClock },
      { href: "/dashboard/agent/commission", label: "Commission", icon: Percent },
      { href: "/dashboard/agent/settlement", label: "Settlement", icon: Landmark },
      { href: "/dashboard/agent/verification", label: "Verification", icon: BadgeCheck },
    ],
  },
  {
    title: "Account",
    items: [
      { href: "/notifications", label: "Notifications", icon: Bell },
      { href: "/profile", label: "Profile & Security", icon: UserRound },
    ],
  },
];

export const AGENT_MOBILE = {
  items: [
    { href: "/dashboard/agent", label: "Home", icon: LayoutDashboard, exact: true },
    { href: "/dashboard/agent/cash-in", label: "Cash In", icon: ArrowDownToLine },
    { href: "/dashboard/agent/cash-out", label: "Cash Out", icon: Banknote },
    { href: "/dashboard/agent/recharge", label: "Recharge", icon: Smartphone },
  ] as NavItem[],
  more: [
    { href: "/transactions", label: "Transactions", icon: FileClock },
    { href: "/dashboard/agent/commission", label: "Commission", icon: Percent },
    { href: "/dashboard/agent/settlement", label: "Settlement", icon: Landmark },
    { href: "/dashboard/agent/customer-payment", label: "Customer Payment", icon: ReceiptText },
    { href: "/dashboard/agent/verification", label: "Verification", icon: BadgeCheck },
    { href: "/profile", label: "Profile", icon: UserRound },
  ] as NavItem[],
};

/* ───────────── Merchant ───────────── */

export const MERCHANT_NAV: NavItem[] = [
  { href: "/dashboard/merchant", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/merchant/receive", label: "Receive Payment", icon: Wallet },
  { href: "/dashboard/merchant/qr", label: "QR Code", icon: QrCode },
  { href: "/dashboard/merchant/sales", label: "Sales", icon: ChartColumnBig },
  { href: "/transactions", label: "Payments", icon: FileClock },
  { href: "/dashboard/merchant/refunds", label: "Refunds", icon: RotateCcw },
  { href: "/dashboard/merchant/settlement", label: "Settlement", icon: Landmark },
  { href: "/dashboard/merchant/business", label: "Business", icon: Building },
];

export const MERCHANT_MOBILE = {
  items: [
    { href: "/dashboard/merchant", label: "Home", icon: LayoutDashboard, exact: true },
    { href: "/dashboard/merchant/receive", label: "Receive", icon: Wallet },
    { href: "/dashboard/merchant/qr", label: "QR", icon: QrCode },
    { href: "/dashboard/merchant/sales", label: "Sales", icon: ChartColumnBig },
  ] as NavItem[],
  more: [
    { href: "/transactions", label: "Transactions", icon: FileClock },
    { href: "/dashboard/merchant/settlement", label: "Settlement", icon: Landmark },
    { href: "/dashboard/merchant/refunds", label: "Refunds", icon: RotateCcw },
    { href: "/dashboard/merchant/business", label: "Business", icon: Building },
    { href: "/notifications", label: "Notifications", icon: Bell },
    { href: "/profile", label: "Profile", icon: UserRound },
  ] as NavItem[],
};

/* ───────────── Admin ───────────── */

export const ADMIN_NAV: NavSection[] = [
  {
    items: [
      { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
      { href: "/admin/verifications", label: "Verifications", icon: BadgeCheck },
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/transactions", label: "Transactions", icon: ClipboardList },
      { href: "/admin/disputes", label: "Disputes", icon: Gavel },
      { href: "/admin/audit-logs", label: "Audit logs", icon: ScrollText },
    ],
  },
  { title: "Account", items: [{ href: "/profile", label: "My profile", icon: UserRound }] },
];
