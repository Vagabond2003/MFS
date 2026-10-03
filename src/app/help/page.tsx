import { ChevronDown, Headphones, Mail, MessageCircle, ShieldAlert } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { SiteFooter, SiteHeader } from "@/features/landing/site-header";
import { msg } from "@/lib/i18n/core";
import { getT, titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Help & Support");

const FAQ = [
  {
    q: msg("What are the fees?"),
    a: msg("Send Money is free up to ৳1,000 and ৳5 above that. Cash Out costs 1.85%. Bill payments cost ৳5. Mobile recharge, Add Money and merchant payments are free for customers. You always see the exact fee before you confirm."),
  },
  {
    q: msg("Why was I asked for a one-time code?"),
    a: msg("Payments of ৳10,000 or more need a one-time code in addition to your PIN. Agent-assisted Cash Out also needs the customer to approve with a code sent to their phone."),
  },
  {
    q: msg("What are my limits?"),
    a: msg("Verified personal accounts can send up to ৳25,000 per transaction and ৳50,000 per day. Accounts pending verification are limited to ৳5,000 per transaction and ৳10,000 per day."),
  },
  {
    q: msg("How long does agent or merchant verification take?"),
    a: msg("Our team reviews documents within 1–3 business days. You can track the status from your dashboard. Agent operations and merchant payments unlock as soon as you're verified."),
  },
  {
    q: msg("I entered my PIN wrong several times."),
    a: msg("After 3 wrong attempts your PIN is locked for 15 minutes to protect your account. You can change your PIN from Profile & Security using a one-time code."),
  },
  {
    q: msg("A payment went wrong. What do I do?"),
    a: msg("Open the transaction from your history and choose “Report a problem”. Disputes can be raised within 30 days and are tracked until they're resolved."),
  },
  {
    q: msg("Is this a real financial service?"),
    a: msg("No. Kosh is a demonstration product. All people, businesses and transactions are fictional, and no real money moves."),
  },
];

export default async function HelpPage() {
  const t = await getT();
  return (
    <div className="bg-white">
      <SiteHeader />
      <section className="bg-gradient-to-b from-brand-50/70 to-white">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 text-white">
            <Headphones className="h-6 w-6" aria-hidden />
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{t("How can we help?")}</h1>
          <p className="mt-3 text-slate-600">{t("Answers to common questions, and ways to reach our support team.")}</p>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-20 sm:px-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t("Frequently asked questions")}</h2>
          <div className="mt-4 divide-y divide-slate-200 rounded-2xl border border-slate-200">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-slate-900">
                  {t(q)}
                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" aria-hidden />
                </summary>
                <p className="mt-3 text-sm text-slate-600">{t(a)}</p>
              </details>
            ))}
          </div>
        </div>
        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 p-5">
            <MessageCircle className="h-5 w-5 text-brand-600" aria-hidden />
            <h3 className="mt-3 font-semibold text-slate-900">{t("Contact support")}</h3>
            <p className="mt-1 text-sm text-slate-500">{t("Signed-in customers can report a problem directly from any transaction.")}</p>
            <p className="mt-3 flex items-center gap-2 text-sm text-slate-700">
              <Mail className="h-4 w-4 text-slate-400" aria-hidden /> support@example.com
            </p>
          </div>
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
            <ShieldAlert className="h-5 w-5 text-rose-600" aria-hidden />
            <h3 className="mt-3 font-semibold text-rose-900">{t("Never share your PIN or OTP")}</h3>
            <p className="mt-1 text-sm text-rose-800">{t("Kosh staff will never ask for your PIN, password or one-time code — by phone, SMS or in person.")}</p>
          </div>
          <div className="rounded-2xl bg-slate-900 p-5 text-white">
            <h3 className="font-semibold">{t("New to Kosh?")}</h3>
            <p className="mt-1 text-sm text-slate-300">{t("Open a personal, agent or merchant account in minutes.")}</p>
            <ButtonLink href="/register" variant="brand" size="sm" className="mt-4">
              {t("Create account")}
            </ButtonLink>
          </div>
        </aside>
      </section>
      <SiteFooter />
    </div>
  );
}
