import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[linear-gradient(180deg,#eefbf6_0,#f4f6f8_320px)]">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <p className="text-sm text-slate-500">
          Have an account?{" "}
          <Link href="/login" className="font-semibold text-brand-700 hover:underline">
            Sign in
          </Link>
        </p>
      </header>
      <main className="px-4 pb-16 pt-4 sm:px-6 sm:pt-8">{children}</main>
    </div>
  );
}
