import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNowStrict, isToday, isYesterday } from "date-fns";
import { bn } from "date-fns/locale/bn";
import { msg, type Lang } from "@/lib/i18n/core";
import type { Money } from "@/types/domain";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ───────────── Money (integer poisha ⇄ display) ───────────── */

const moneyFormatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const wholeFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** ৳1,23,456.00 — Bangladeshi lakh grouping. */
export function formatMoney(minor: Money, opts: { sign?: boolean; whole?: boolean } = {}) {
  const value = minor / 100;
  const body = (opts.whole ? wholeFormatter : moneyFormatter).format(Math.abs(value));
  const sign = minor < 0 ? "−" : opts.sign && minor > 0 ? "+" : "";
  return `${sign}৳${body}`;
}

/** Compact money for chart axes and tight tiles: ৳12.4K, ৳3.2L, ৳1.1Cr */
export function formatMoneyCompact(minor: Money) {
  const v = Math.abs(minor / 100);
  const sign = minor < 0 ? "−" : "";
  const fmt = (n: number, unit: string) => `${sign}৳${trimZero(n.toFixed(n >= 100 ? 0 : 1))}${unit}`;
  if (v >= 1e7) return fmt(v / 1e7, "Cr");
  if (v >= 1e5) return fmt(v / 1e5, "L");
  if (v >= 1e3) return fmt(v / 1e3, "K");
  return `${sign}৳${trimZero(v.toFixed(0))}`;
}

export function formatCount(n: number) {
  if (n >= 1e5) return `${trimZero((n / 1e5).toFixed(1))}L`;
  if (n >= 1e4) return `${trimZero((n / 1e3).toFixed(1))}K`;
  return wholeFormatter.format(n);
}

function trimZero(s: string) {
  return s.replace(/\.0$/, "");
}

/** Parse a user-typed taka amount ("1,250.5") into integer poisha. */
export function toMinor(input: string | number): Money {
  const n = typeof input === "number" ? input : Number(String(input).replace(/[,\s৳]/g, ""));
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

export function percentChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/* ───────────── Dates ───────────── */
// Pass the interface language (`lang` from useI18n) for Bengali month/day names.

const dateLocale = (lang: Lang) => (lang === "bn" ? { locale: bn } : undefined);

export function formatDateTime(iso: string, lang: Lang = "en") {
  return format(new Date(iso), "d MMM yyyy, h:mm a", dateLocale(lang));
}

export function formatDate(iso: string, lang: Lang = "en") {
  return format(new Date(iso), "d MMM yyyy", dateLocale(lang));
}

export function formatTime(iso: string, lang: Lang = "en") {
  return format(new Date(iso), "h:mm a", dateLocale(lang));
}

export function formatRelative(iso: string, lang: Lang = "en") {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const bnLang = lang === "bn";
  if (diff < 60_000) return bnLang ? "এইমাত্র" : "Just now";
  if (diff < 86_400_000 && isToday(d)) return `${formatDistanceToNowStrict(d, dateLocale(lang))} ${bnLang ? "আগে" : "ago"}`;
  if (isYesterday(d)) return `${bnLang ? "গতকাল" : "Yesterday"}, ${format(d, "h:mm a", dateLocale(lang))}`;
  return format(d, "d MMM, h:mm a", dateLocale(lang));
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return msg("Good morning");
  if (h < 17) return msg("Good afternoon");
  return msg("Good evening");
}

/* ───────────── Masking & identifiers ───────────── */

export function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return phone;
  return `${digits.slice(0, 3)}•••••${digits.slice(-3)}`;
}

export function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  if (!domain) return email;
  return `${user.slice(0, 2)}•••@${domain}`;
}

export function maskTail(value: string, visible = 4) {
  const clean = value.replace(/\s/g, "");
  return `•••• ${clean.slice(-visible)}`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** Accepts 01XXXXXXXXX, +8801XXXXXXXXX, 8801XXXXXXXXX → 01XXXXXXXXX */
export function normalizePhone(input: string) {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("880")) return `0${digits.slice(3)}`;
  return digits;
}

export function formatPhone(phone: string) {
  const d = normalizePhone(phone);
  if (d.length !== 11) return phone;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function titleCase(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
