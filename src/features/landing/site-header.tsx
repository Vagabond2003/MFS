"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";
import { Sheet } from "@/components/ui/modal";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { useI18n } from "@/hooks/use-i18n";
import { msg } from "@/lib/i18n/core";

const LINKS = [
  { href: "/", label: msg("Home") },
  { href: "/#services", label: msg("Services") },
  { href: "/#about", label: msg("About") },
  { href: "/help", label: msg("Help & Support") },
];

export function SiteHeader() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex" aria-label={t("Site")}>
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">
              {t(l.label)}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <LanguageToggle className="mr-1" />
          <ButtonLink href="/login" variant="ghost" size="sm">
            {t("Login")}
          </ButtonLink>
          <ButtonLink href="/register" variant="brand" size="sm">
            {t("Sign Up")}
          </ButtonLink>
        </div>
        <div className="flex items-center gap-1 md:hidden">
          <LanguageToggle />
          <button type="button" className="grid h-10 w-10 place-items-center rounded-lg text-slate-700 hover:bg-slate-100" onClick={() => setOpen(true)} aria-label={t("Open menu")}>
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title={t("Menu")} side="bottom">
        <nav className="space-y-1" aria-label={t("Site")}>
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-xl px-3 py-3 text-base font-medium text-slate-700 hover:bg-slate-100">
              {t(l.label)}
            </Link>
          ))}
        </nav>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <ButtonLink href="/login" variant="outline" onClick={() => setOpen(false)}>
            {t("Login")}
          </ButtonLink>
          <ButtonLink href="/register" variant="brand" onClick={() => setOpen(false)}>
            {t("Sign Up")}
          </ButtonLink>
        </div>
      </Sheet>
    </header>
  );
}

export function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4 lg:px-8">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-4 max-w-sm text-sm text-slate-500">
            {t("Kosh brings everyday payments to your phone — for customers, the agents who serve them and the businesses they buy from.")}
          </p>
          <p className="mt-4 max-w-sm rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {t("Kosh is a demonstration product built for a hackathon. It is not a licensed financial service and moves no real money.")}
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">{t("Product")}</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-500">
            <li><Link href="/#services" className="hover:text-slate-900">{t("Services")}</Link></li>
            <li><Link href="/register/personal" className="hover:text-slate-900">{t("Personal account")}</Link></li>
            <li><Link href="/register/agent" className="hover:text-slate-900">{t("Become an agent")}</Link></li>
            <li><Link href="/register/merchant" className="hover:text-slate-900">{t("Accept payments")}</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">{t("Company")}</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-500">
            <li><Link href="/#about" className="hover:text-slate-900">{t("About")}</Link></li>
            <li><Link href="/help" className="hover:text-slate-900">{t("Help & Support")}</Link></li>
            <li><Link href="/login" className="hover:text-slate-900">{t("Login")}</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-100 py-5 text-center text-xs text-slate-400">© {new Date().getFullYear()} {t("Kosh (demo). All data shown is fictional.")}</div>
    </footer>
  );
}
