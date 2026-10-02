"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Mail, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CodeInput, DevCodeHint } from "@/components/ui/code-input";
import { Tabs } from "@/components/ui/data";
import { Alert } from "@/components/ui/feedback";
import { Checkbox, Field, Input, PasswordInput, PhoneInput } from "@/components/ui/form";
import { ResendButton } from "@/components/flows/transaction-flow";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/config/demo-accounts";
import { useAuth } from "@/hooks/use-auth";
import { useHydrated } from "@/hooks/use-hydrated";
import { api } from "@/services";
import { toApiError } from "@/services/errors";
import { ROLE_LABEL, safeNextPath } from "@/lib/auth/access";
import { BD_PHONE } from "@/lib/validation";
import { cn, normalizePhone } from "@/lib/utils";
import type { OtpChallenge, SessionInfo } from "@/types/domain";

type Method = "phone" | "email";

const schema = z
  .object({
    method: z.enum(["phone", "email"]),
    identifier: z.string().trim().min(1, "Required"),
    password: z.string().min(1, "Enter your password"),
    remember: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.method === "phone" && !BD_PHONE.test(normalizePhone(v.identifier))) {
      ctx.addIssue({ code: "custom", path: ["identifier"], message: "Enter a valid 11-digit mobile number" });
    }
    if (v.method === "email" && !z.email().safeParse(v.identifier).success) {
      ctx.addIssue({ code: "custom", path: ["identifier"], message: "Enter a valid email address" });
    }
  });

type Values = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { setSession } = useAuth();
  const hydrated = useHydrated();
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { method: "phone", identifier: "", password: "", remember: false },
  });
  const method = form.watch("method");
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    if (params.get("signedOut")) toast.success("You've been signed out.");
  }, [params]);

  const finish = (s: SessionInfo) => {
    setSession(s);
    toast.success(`Welcome back, ${s.user.businessName ?? (s.user.role === "ADMIN" ? s.user.name : s.user.name.split(" ")[0])}`);
    router.replace(safeNextPath(s.user.role, params.get("next")));
  };

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      const res = await api.auth.login({ identifier: v.identifier, password: v.password, remember: v.remember });
      if (res.status === "OTP_REQUIRED") {
        setChallenge(res.challenge);
        setCode("");
      } else finish(res.session);
    } catch (e) {
      setError(toApiError(e).message);
    }
  });

  const verify = async (value = code) => {
    if (!challenge || value.length !== 6) return;
    setVerifying(true);
    setError(null);
    try {
      finish(await api.auth.verifyLoginOtp(challenge.challengeId, value, form.getValues("remember")));
    } catch (e) {
      setError(toApiError(e).message);
      setCode("");
    } finally {
      setVerifying(false);
    }
  };

  const fillDemo = (identifier: string) => {
    const isEmail = identifier.includes("@");
    form.reset({ method: isEmail ? "email" : "phone", identifier, password: DEMO_PASSWORD, remember: false });
    setError(null);
  };

  if (challenge) {
    return (
      <div className="animate-fade-in">
        <button type="button" onClick={() => { setChallenge(null); setError(null); }} className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back
        </button>
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-700">
          <ShieldCheck className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">Two-step verification</h1>
        <p className="mt-1 text-sm text-slate-500">
          Enter the 6-digit code sent to <span className="tabular font-medium text-slate-700">{challenge.destinationMasked}</span>.
        </p>
        <div className="mt-6 space-y-4">
          <CodeInput length={6} value={code} onChange={setCode} label="Verification code" autoFocus onComplete={(v) => void verify(v)} invalid={!!error} />
          <DevCodeHint code={challenge.devCode} />
          {error && <Alert tone="danger">{error}</Alert>}
          <Button variant="brand" fullWidth size="lg" loading={verifying} disabled={code.length !== 6} onClick={() => void verify()}>
            Verify and sign in
          </Button>
          <ResendButton
            challenge={challenge}
            onResend={async () => {
              try {
                setChallenge(await api.auth.resendLoginOtp(challenge.challengeId));
                toast.success("A new code was sent");
              } catch (e) {
                toast.error(toApiError(e).message);
              }
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Sign in to Kosh</h1>
      <p className="mt-1 text-sm text-slate-500">
        New here?{" "}
        <Link href="/register" className="font-semibold text-brand-700 hover:underline">
          Create an account
        </Link>
      </p>

      <form onSubmit={onSubmit} method="post" className="mt-8 space-y-5" noValidate>
        <Tabs<Method>
          ariaLabel="Sign in with"
          value={method}
          onChange={(m) => {
            form.setValue("method", m);
            form.setValue("identifier", "");
            form.clearErrors("identifier");
          }}
          tabs={[
            { value: "phone", label: <span className="flex items-center gap-1.5"><Smartphone className="h-4 w-4" aria-hidden /> Mobile number</span> },
            { value: "email", label: <span className="flex items-center gap-1.5"><Mail className="h-4 w-4" aria-hidden /> Email</span> },
          ]}
          className="w-full [&>button]:flex-1 [&>button]:justify-center"
        />

        <Field label={method === "phone" ? "Mobile number" : "Email address"} error={errors.identifier?.message}>
          {(p) =>
            method === "phone" ? (
              <PhoneInput {...p} {...form.register("identifier")} />
            ) : (
              <Input {...p} type="email" autoComplete="email" placeholder="you@example.com" {...form.register("identifier")} />
            )
          }
        </Field>

        <Field label="Password" error={errors.password?.message}>
          {(p) => <PasswordInput {...p} autoComplete="current-password" placeholder="Your password" {...form.register("password")} />}
        </Field>

        <div className="flex items-center justify-between gap-3">
          <Checkbox label="Remember me" {...form.register("remember")} />
          <Link href="/forgot-password" className="text-sm font-semibold text-brand-700 hover:underline">
            Forgot password?
          </Link>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}

        <Button type="submit" variant="brand" size="lg" fullWidth loading={isSubmitting} disabled={!hydrated}>
          Sign in
        </Button>
      </form>

      {api.mode === "mock" && <DemoAccounts onPick={fillDemo} />}
    </div>
  );
}

function DemoAccounts({ onPick }: { onPick: (identifier: string) => void }) {
  const roleTone: Record<string, string> = {
    PERSONAL: "bg-emerald-50 text-emerald-700",
    AGENT: "bg-amber-50 text-amber-800",
    MERCHANT: "bg-indigo-50 text-indigo-700",
    ADMIN: "bg-sky-50 text-sky-700",
  };
  return (
    <div className="mt-10 rounded-2xl border border-dashed border-amber-300 bg-amber-50/50 p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-amber-900">Development demo accounts</p>
      <p className="mt-1 text-xs text-amber-900/80">
        Fictional accounts. Password <span className="font-mono font-semibold">{DEMO_PASSWORD}</span> · PIN <span className="font-mono font-semibold">24680</span>. Click to fill the form.
      </p>
      <ul className="mt-3 grid gap-1.5">
        {DEMO_ACCOUNTS.map((a) => (
          <li key={a.identifier}>
            <button type="button" onClick={() => onPick(a.identifier)} className="flex w-full items-center gap-3 rounded-xl bg-white px-3 py-2 text-left ring-1 ring-amber-200/60 transition hover:ring-amber-400">
              <span className={cn("w-[72px] shrink-0 rounded-md px-1.5 py-0.5 text-center text-[10px] font-bold uppercase tracking-wide", roleTone[a.role])}>{ROLE_LABEL[a.role]}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">{a.name}</span>
                <span className="block truncate text-[11px] text-slate-500">{a.note}</span>
              </span>
              <span className="tabular hidden text-[11px] text-slate-400 sm:block">{a.identifier}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
