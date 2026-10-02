import { Compass } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4">
      <div className="max-w-md text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-200 text-slate-600">
          <Compass className="h-7 w-7" aria-hidden />
        </span>
        <p className="mt-5 text-xs font-bold uppercase tracking-wider text-slate-500">404</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Page not found</h1>
        <p className="mt-2 text-sm text-slate-500">The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
        <ButtonLink href="/" variant="brand" className="mt-6">
          Back to home
        </ButtonLink>
      </div>
    </div>
  );
}
