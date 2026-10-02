import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("h-9 w-9", className)} aria-hidden>
      <rect width="40" height="40" rx="12" fill="#0d8065" />
      <path d="M13 11v18" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
      <path d="M27.5 11 17.5 20.5 28 29" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="29.5" cy="11" r="3" fill="#ade9d3" />
    </svg>
  );
}

export function Logo({
  href = "/",
  tone = "dark",
  suffix,
  className,
}: {
  href?: string;
  tone?: "dark" | "light";
  suffix?: React.ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={cn("flex items-center gap-2.5", className)} aria-label="Kosh home">
      <LogoMark />
      <span className={cn("text-xl font-extrabold tracking-tight", tone === "light" ? "text-white" : "text-slate-900")}>Kosh</span>
      {suffix}
    </Link>
  );
}
