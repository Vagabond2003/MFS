"use client";

import Link from "next/link";
import { useState } from "react";
import type { FieldPath, FieldValues, UseFormReturn } from "react-hook-form";
import { ArrowLeft, ArrowRight, CircleCheck, MessageSquareText } from "lucide-react";
import { toast } from "sonner";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CodeInput, DevCodeHint } from "@/components/ui/code-input";
import { Stepper } from "@/components/ui/data";
import { Alert } from "@/components/ui/feedback";
import { ResendButton } from "@/components/flows/transaction-flow";
import { api } from "@/services";
import { useHydrated } from "@/hooks/use-hydrated";
import { toApiError, type ApiError } from "@/services/errors";
import { cn, maskPhone } from "@/lib/utils";
import type { OtpChallenge } from "@/types/domain";

export interface WizardStep<T extends FieldValues> {
  title: string;
  fields: FieldPath<T>[];
  /** Cross-field checks for this step (e.g. confirm password). */
  check?: (values: T) => { field: FieldPath<T>; message: string }[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useWizard<T extends FieldValues>(form: UseFormReturn<T, any, any>, steps: WizardStep<T>[]) {
  const [step, setStep] = useState(0);

  const goTo = (i: number) => {
    setStep(i);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const next = async () => {
    const current = steps[step];
    const ok = await form.trigger(current.fields, { shouldFocus: true });
    const problems = current.check?.(form.getValues()) ?? [];
    problems.forEach((p) => form.setError(p.field, { message: p.message }, { shouldFocus: true }));
    if (ok && problems.length === 0) goTo(Math.min(step + 1, steps.length - 1));
  };

  /** Map server field errors back onto the form and jump to that step. */
  const applyServerError = (err: ApiError) => {
    const fields = Object.entries(err.fieldErrors ?? {});
    for (const [field, message] of fields) form.setError(field as FieldPath<T>, { message });
    const firstField = fields[0]?.[0] ?? (err.code === "INVALID_OTP" || err.code === "OTP_EXPIRED" ? "otpCode" : null);
    if (firstField) {
      if (firstField === "otpCode") form.setError("otpCode" as FieldPath<T>, { message: err.message });
      const idx = steps.findIndex((s) => (s.fields as string[]).includes(firstField));
      if (idx >= 0) goTo(idx);
    }
  };

  /** After a failed full validation, jump to the first step with an error. */
  const jumpToFirstError = () => {
    const errored = Object.keys(form.formState.errors);
    const idx = steps.findIndex((s) => (s.fields as string[]).some((f) => errored.includes(f)));
    if (idx >= 0) goTo(idx);
  };

  return {
    step,
    isLast: step === steps.length - 1,
    next,
    back: () => goTo(Math.max(0, step - 1)),
    goTo,
    applyServerError,
    jumpToFirstError,
  };
}

export function WizardFrame({
  icon,
  title,
  subtitle,
  steps,
  step,
  children,
  onBack,
  onNext,
  isLast,
  submitting,
  submitLabel,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  steps: string[];
  step: number;
  children: React.ReactNode;
  onBack: () => void;
  onNext: () => void;
  isLast: boolean;
  submitting: boolean;
  submitLabel: string;
  tone: "personal" | "agent" | "merchant";
}) {
  const hydrated = useHydrated();
  return (
    <div className={cn(`theme-${tone}`, "mx-auto max-w-3xl")}>
      <Link href="/register" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Change account type
      </Link>
      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 bg-gradient-to-br from-accent-50 to-white px-5 py-6 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-600 text-accent-fg">{icon}</span>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
              <p className="text-sm text-slate-500">{subtitle}</p>
            </div>
          </div>
          <div className="mt-6">
            <Stepper steps={steps} current={step} />
          </div>
          <p className="mt-3 text-xs font-medium text-slate-500 md:hidden">
            Step {step + 1} of {steps.length}: <span className="text-slate-700">{steps[step]}</span>
          </p>
        </div>
        <form
          method="post"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            onNext();
          }}
        >
          <div className="px-5 py-6 sm:px-8 sm:py-8">
            <div key={step} className="animate-fade-in space-y-5">
              {children}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 sm:px-8">
            <Button variant="ghost" onClick={onBack} disabled={step === 0 || submitting}>
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back
            </Button>
            <Button type="submit" size="lg" loading={submitting} disabled={!hydrated}>
              {isLast ? submitLabel : "Continue"} {!isLast && <ArrowRight className="h-4 w-4" aria-hidden />}
            </Button>
          </div>
        </form>
      </Card>
      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

/** Sends and captures the registration OTP for the phone entered earlier. */
export function PhoneVerification({
  phone,
  challenge,
  onChallenge,
  code,
  onCode,
  error,
}: {
  phone: string;
  challenge: OtpChallenge | null;
  onChallenge: (c: OtpChallenge) => void;
  code: string;
  onCode: (v: string) => void;
  error?: string;
}) {
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      onChallenge(await api.registration.sendPhoneOtp(phone));
      onCode("");
      toast.success("Verification code sent");
    } catch (e) {
      toast.error(toApiError(e).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-50 text-accent-700">
          <MessageSquareText className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <div className="text-sm">
          <p className="font-semibold text-slate-900">Verify your mobile number</p>
          <p className="text-slate-500">
            We&apos;ll send a 6-digit code to <span className="tabular font-medium text-slate-700">{maskPhone(phone)}</span>.
          </p>
        </div>
      </div>
      {challenge ? (
        <>
          <CodeInput length={6} value={code} onChange={onCode} label="Verification code" invalid={!!error} autoFocus />
          <DevCodeHint code={challenge.devCode} />
          {error && <p className="text-[13px] font-medium text-rose-600">{error}</p>}
          <ResendButton challenge={challenge} onResend={send} disabled={busy} />
        </>
      ) : (
        <>
          <Button variant="soft" onClick={send} loading={busy}>
            Send verification code
          </Button>
          {error && <p className="text-[13px] font-medium text-rose-600">{error}</p>}
        </>
      )}
    </div>
  );
}

export function RegistrationSuccess({
  title,
  message,
  details,
  note,
}: {
  title: string;
  message: string;
  details: { label: string; value: React.ReactNode }[];
  note?: React.ReactNode;
}) {
  return (
    <Card className="mx-auto max-w-lg p-8 text-center">
      <span className="mx-auto grid h-16 w-16 animate-pop place-items-center rounded-full bg-emerald-100 text-emerald-600">
        <CircleCheck className="h-9 w-9" aria-hidden />
      </span>
      <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">{message}</p>
      <dl className="mt-6 divide-y divide-slate-100 rounded-2xl bg-slate-50 px-4 text-left text-sm">
        {details.map((d) => (
          <div key={d.label} className="flex justify-between gap-4 py-2.5">
            <dt className="text-slate-500">{d.label}</dt>
            <dd className="font-medium text-slate-900">{d.value}</dd>
          </div>
        ))}
      </dl>
      {note && <Alert className="mt-4 text-left">{note}</Alert>}
      <ButtonLink href="/login" variant="brand" size="lg" fullWidth className="mt-6">
        Continue to sign in
      </ButtonLink>
    </Card>
  );
}

export function StepIntro({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {children && <p className="mt-1 text-sm text-slate-500">{children}</p>}
    </div>
  );
}

export function TermsBox({ children }: { children: React.ReactNode }) {
  return <div className="scroll-thin max-h-36 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">{children}</div>;
}
