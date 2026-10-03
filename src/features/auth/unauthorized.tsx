"use client";

import { useSearchParams } from "next/navigation";
import { ShieldX } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { ROLE_HOME, ROLE_LABEL } from "@/lib/auth/access";

export function Unauthorized() {
  const { t } = useI18n();
  const params = useSearchParams();
  const { user, status } = useAuth();
  const from = params.get("from");
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-card">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-600">
          <ShieldX className="h-7 w-7" aria-hidden />
        </span>
        <p className="mt-5 text-xs font-bold uppercase tracking-wider text-rose-600">{t("403 · Not authorised")}</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{t("This area isn't available to your account")}</h1>
        <p className="mt-2 text-sm text-slate-500">
          {user && (
            <>
              {user.role === "ADMIN"
                ? t("You're signed in with an {role} account.", { role: t(ROLE_LABEL[user.role]) })
                : t("You're signed in with a {role} account.", { role: t(ROLE_LABEL[user.role]) })}{" "}
              {from ? (
                <>
                  {t("It can't open")} <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{from}</code>.{" "}
                </>
              ) : null}
            </>
          )}
          {t("Each account type only has access to its own dashboard and features.")}
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {status === "loading" ? null : user ? (
            <ButtonLink href={ROLE_HOME[user.role]} variant="brand">
              {t("Go to my dashboard")}
            </ButtonLink>
          ) : (
            <ButtonLink href="/login" variant="brand">
              {t("Sign in")}
            </ButtonLink>
          )}
          <ButtonLink href="/help" variant="outline">
            {t("Get help")}
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
