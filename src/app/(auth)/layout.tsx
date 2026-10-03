import { CircleCheck } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { getT } from "@/lib/i18n/server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getT();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden overflow-hidden bg-brand-950 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_50%_at_20%_0%,rgba(61,189,151,0.35),transparent_70%),radial-gradient(60%_50%_at_100%_100%,rgba(42,120,214,0.25),transparent_70%)]" aria-hidden />
        <div className="relative">
          <Logo tone="light" />
        </div>
        <div className="relative max-w-md">
          <h2 className="text-4xl font-bold leading-tight tracking-tight text-white">{t("One sign-in. The right dashboard for you.")}</h2>
          <p className="mt-4 text-brand-100/80">
            {t("Personal customers, agents and merchants all sign in here. Kosh checks your account type on the server and takes you to your own workspace.")}
          </p>
          <ul className="mt-8 space-y-3 text-sm text-brand-50">
            {[t("Mobile number or email sign-in"), t("One-time code when extra security is on"), t("Sign out of every device from your profile")].map((point) => (
              <li key={point} className="flex items-center gap-2.5">
                <CircleCheck className="h-4 w-4 text-brand-300" aria-hidden /> {point}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-brand-200/60">{t("Demo product · fictional data · no real money moves.")}</p>
      </aside>
      <main className="flex flex-col bg-white">
        <div className="flex h-16 items-center justify-between px-6 lg:justify-end">
          <Logo className="lg:hidden" />
          <LanguageToggle />
        </div>
        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </main>
    </div>
  );
}
