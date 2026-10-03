import { Compass } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
  const t = await getT();
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4">
      <div className="max-w-md text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-200 text-slate-600">
          <Compass className="h-7 w-7" aria-hidden />
        </span>
        <p className="mt-5 text-xs font-bold uppercase tracking-wider text-slate-500">404</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{t("Page not found")}</h1>
        <p className="mt-2 text-sm text-slate-500">{t("The page you're looking for doesn't exist or has moved.")}</p>
        <ButtonLink href="/" variant="brand" className="mt-6">
          {t("Back to home")}
        </ButtonLink>
      </div>
    </div>
  );
}
