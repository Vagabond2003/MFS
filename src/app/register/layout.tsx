import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { getT } from "@/lib/i18n/server";

export default async function RegisterLayout({ children }: { children: React.ReactNode }) {
  const t = await getT();
  return (
    <div className="min-h-dvh bg-[linear-gradient(180deg,#eefbf6_0,#f4f6f8_320px)]">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-3">
          <p className="hidden text-sm text-slate-500 sm:block">
            {t("Have an account?")}{" "}
            <Link href="/login" className="font-semibold text-brand-700 hover:underline">
              {t("Sign in")}
            </Link>
          </p>
          <LanguageToggle />
        </div>
      </header>
      <main className="px-4 pb-16 pt-4 sm:px-6 sm:pt-8">{children}</main>
    </div>
  );
}
