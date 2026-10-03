import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, CircleCheck, Store, UserRound } from "lucide-react";
import { msg } from "@/lib/i18n/core";
import { getT, titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Create account");

const ROLES = [
  {
    href: "/register/personal",
    icon: UserRound,
    title: msg("Personal Account"),
    text: msg("For normal customers."),
    needs: [msg("Mobile number & date of birth"), msg("Password, PIN and OTP"), msg("NID & selfie optional (instant e-KYC)")],
    time: msg("About 3 minutes"),
    tone: "bg-emerald-50 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white",
    ring: "hover:border-emerald-300",
  },
  {
    href: "/register/agent",
    icon: BriefcaseBusiness,
    title: msg("Agent Account"),
    text: msg("For authorised financial service agents."),
    needs: [msg("NID, photograph & outlet address"), msg("Emergency contact"), msg("Reviewed and approved by an administrator")],
    time: msg("About 8 minutes + review"),
    tone: "bg-amber-50 text-amber-700 group-hover:bg-amber-500 group-hover:text-slate-950",
    ring: "hover:border-amber-300",
  },
  {
    href: "/register/merchant",
    icon: Store,
    title: msg("Merchant Account"),
    text: msg("For restaurants, shops, businesses and organisations."),
    needs: [msg("Trade license & registration"), msg("Owner identity verification"), msg("Payments enabled after verification")],
    time: msg("About 10 minutes + review"),
    tone: "bg-indigo-50 text-indigo-700 group-hover:bg-indigo-600 group-hover:text-white",
    ring: "hover:border-indigo-300",
  },
];

export default async function RegisterPage() {
  const t = await getT();
  return (
    <div className="mx-auto max-w-5xl">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{t("Choose your account type")}</h1>
        <p className="mx-auto mt-2 max-w-xl text-slate-500">
          {t("Each account type has its own checks and its own dashboard. You can't switch type later, so pick the one that fits how you'll use Kosh.")}
        </p>
      </div>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {ROLES.map(({ href, icon: Icon, title, text, needs, time, tone, ring }) => (
          <Link
            key={href}
            href={href}
            className={`group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg ${ring}`}
          >
            <span className={`grid h-12 w-12 place-items-center rounded-2xl transition ${tone}`}>
              <Icon className="h-6 w-6" aria-hidden />
            </span>
            <h2 className="mt-5 text-lg font-bold text-slate-900">{t(title)}</h2>
            <p className="mt-1 text-sm text-slate-500">{t(text)}</p>
            <ul className="mt-5 flex-1 space-y-2 text-sm text-slate-600">
              {needs.map((n) => (
                <li key={n} className="flex items-start gap-2">
                  <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden /> {t(n)}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
              <span className="text-xs text-slate-400">{t(time)}</span>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-900">
                {t("Continue")} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
