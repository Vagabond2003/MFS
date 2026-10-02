"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CircleCheck, ScanFace, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { FileDrop } from "@/components/ui/file-drop";
import { Checkbox, Field, Input, PasswordInput, PhoneInput, Textarea } from "@/components/ui/form";
import { api } from "@/services";
import { toApiError } from "@/services/errors";
import { personalRegistrationSchema } from "@/lib/validation";
import { formatPhone } from "@/lib/utils";
import type { OtpChallenge } from "@/types/domain";
import { PhoneVerification, RegistrationSuccess, StepIntro, TermsBox, WizardFrame, useWizard, type WizardStep } from "./wizard";

const schema = personalRegistrationSchema.extend({ confirmPassword: z.string(), confirmPin: z.string() });
type Values = z.input<typeof schema>;

const STEPS: WizardStep<Values>[] = [
  { title: "Your details", fields: ["fullName", "phone", "email", "dateOfBirth", "address"] },
  {
    title: "Security",
    fields: ["password", "confirmPassword", "pin", "confirmPin"],
    check: (v) => [
      ...(v.password !== v.confirmPassword ? [{ field: "confirmPassword" as const, message: "Passwords don't match" }] : []),
      ...(v.pin !== v.confirmPin ? [{ field: "confirmPin" as const, message: "PINs don't match" }] : []),
    ],
  },
  { title: "Identity (optional)", fields: ["nidNumber", "nidDocument"] },
  { title: "Verify & finish", fields: ["otpChallengeId", "otpCode", "acceptTerms"] },
];

export function PersonalRegistration() {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { fullName: "", phone: "", email: "", dateOfBirth: "", address: "", password: "", confirmPassword: "", pin: "", confirmPin: "", nidNumber: "", nidDocument: null, selfieCheckId: null, otpChallengeId: "", otpCode: "", acceptTerms: false },
  });
  const wizard = useWizard(form, STEPS);
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [selfie, setSelfie] = useState<"idle" | "running" | "VERIFIED" | "FAILED" | "PENDING">("idle");
  const [done, setDone] = useState<{ status: string } | null>(null);
  const { errors, isSubmitting } = form.formState;
  const v = form.watch();

  const submit = form.handleSubmit(
    async (values) => {
      try {
        await api.registration.registerPersonal(values);
        const eKyc = !!values.nidNumber && !!values.nidDocument && selfie === "VERIFIED";
        setDone({ status: eKyc ? "Verified (instant e-KYC)" : "Pending verification" });
      } catch (e) {
        const err = toApiError(e);
        toast.error(err.message);
        wizard.applyServerError(err);
      }
    },
    () => wizard.jumpToFirstError(),
  );

  if (done) {
    return (
      <RegistrationSuccess
        title="Your account is ready"
        message="Your personal wallet has been created. Sign in with your mobile number and password."
        details={[
          { label: "Account type", value: "Personal" },
          { label: "Mobile", value: formatPhone(v.phone) },
          { label: "Status", value: done.status },
        ]}
        note={done.status.startsWith("Pending") ? "Until your identity is verified, limits are ৳5,000 per transaction and ৳10,000 per day." : undefined}
      />
    );
  }

  return (
    <WizardFrame
      tone="personal"
      icon={<UserRound className="h-5 w-5" aria-hidden />}
      title="Personal account"
      subtitle="For everyday customers"
      steps={STEPS.map((s) => s.title)}
      step={wizard.step}
      onBack={wizard.back}
      onNext={wizard.isLast ? submit : wizard.next}
      isLast={wizard.isLast}
      submitting={isSubmitting}
      submitLabel="Create account"
    >
      {wizard.step === 0 && (
        <>
          <StepIntro title="Tell us about you">Use your legal name as it appears on your National ID.</StepIntro>
          <Field label="Full name" required error={errors.fullName?.message}>
            {(p) => <Input {...p} autoComplete="name" placeholder="e.g. Ayesha Rahman" {...form.register("fullName")} />}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Mobile number" required error={errors.phone?.message} hint="This will be your wallet number">
              {(p) => <PhoneInput {...p} {...form.register("phone")} />}
            </Field>
            <Field label="Email" optional error={errors.email?.message}>
              {(p) => <Input {...p} type="email" autoComplete="email" placeholder="you@example.com" {...form.register("email")} />}
            </Field>
          </div>
          <Field label="Date of birth" required error={errors.dateOfBirth?.message} hint="You must be 18 or older">
            {(p) => <Input {...p} type="date" autoComplete="bday" max={new Date().toISOString().slice(0, 10)} {...form.register("dateOfBirth")} />}
          </Field>
          <Field label="Address" required error={errors.address?.message}>
            {(p) => <Textarea {...p} rows={2} autoComplete="street-address" placeholder="House, road, area, city" {...form.register("address")} />}
          </Field>
        </>
      )}

      {wizard.step === 1 && (
        <>
          <StepIntro title="Secure your account">Your password signs you in. Your 5-digit PIN authorises every payment — keep them different.</StepIntro>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Password" required error={errors.password?.message} hint="8+ chars, upper & lower case, number, symbol">
              {(p) => <PasswordInput {...p} autoComplete="new-password" strengthOf={v.password} {...form.register("password")} />}
            </Field>
            <Field label="Confirm password" required error={errors.confirmPassword?.message}>
              {(p) => <PasswordInput {...p} autoComplete="new-password" {...form.register("confirmPassword")} />}
            </Field>
            <Field label="Transaction PIN" required error={errors.pin?.message} hint="5 digits, not a simple sequence">
              {(p) => <Input {...p} type="password" inputMode="numeric" maxLength={5} autoComplete="off" placeholder="•••••" className="tracking-[0.5em]" {...form.register("pin")} />}
            </Field>
            <Field label="Confirm PIN" required error={errors.confirmPin?.message}>
              {(p) => <Input {...p} type="password" inputMode="numeric" maxLength={5} autoComplete="off" placeholder="•••••" className="tracking-[0.5em]" {...form.register("confirmPin")} />}
            </Field>
          </div>
        </>
      )}

      {wizard.step === 2 && (
        <>
          <StepIntro title="Verify your identity (optional)">
            Add your NID and a selfie now for instant e-KYC and full limits — or skip and do it later from your profile.
          </StepIntro>
          <Field label="National ID number" optional error={errors.nidNumber?.message} hint="10, 13 or 17 digits">
            {(p) => <Input {...p} inputMode="numeric" placeholder="e.g. 1994261845372" {...form.register("nidNumber")} />}
          </Field>
          <Controller
            control={form.control}
            name="nidDocument"
            render={({ field }) => <FileDrop label="NID document (front)" purpose="NID" value={field.value} onChange={field.onChange} error={errors.nidDocument?.message} />}
          />
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-50 text-accent-700">
              <ScanFace className="h-5 w-5" aria-hidden />
            </span>
            <div className="flex-1 text-sm">
              <p className="font-semibold text-slate-900">Selfie / liveness check</p>
              <p className="text-slate-500">Matches your face to your NID photo. Uses the development KYC provider here.</p>
            </div>
            {selfie === "VERIFIED" ? (
              <Badge tone="success" icon={<CircleCheck className="h-3.5 w-3.5" aria-hidden />}>
                Liveness passed
              </Badge>
            ) : (
              <Button
                variant="outline"
                size="sm"
                loading={selfie === "running"}
                onClick={async () => {
                  setSelfie("running");
                  try {
                    const check = await api.registration.startSelfieCheck();
                    setSelfie(check.status);
                    form.setValue("selfieCheckId", check.checkId);
                  } catch (e) {
                    setSelfie("FAILED");
                    toast.error(toApiError(e).message);
                  }
                }}
              >
                Start selfie check
              </Button>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Status after sign-up: <strong>{v.nidNumber && v.nidDocument && selfie === "VERIFIED" ? "Verified" : "Pending verification"}</strong>. Accounts can also be marked Suspended by our team.
          </p>
        </>
      )}

      {wizard.step === 3 && (
        <>
          <StepIntro title="Almost done">Verify your mobile number and accept the terms to create your wallet.</StepIntro>
          <PhoneVerification
            phone={v.phone}
            challenge={challenge}
            onChallenge={(c) => {
              setChallenge(c);
              form.setValue("otpChallengeId", c.challengeId, { shouldValidate: false });
              form.clearErrors("otpChallengeId");
            }}
            code={v.otpCode}
            onCode={(c) => form.setValue("otpCode", c, { shouldValidate: c.length === 6 })}
            error={errors.otpChallengeId?.message ?? errors.otpCode?.message}
          />
          <TermsBox>
            By creating an account you agree to the Kosh Customer Terms (demo): you are responsible for keeping your PIN and password secret; Kosh will never ask for them. Transactions confirmed
            with your PIN are final except where a dispute is upheld. Limits apply until your identity is verified. We process your data to provide the service and to meet anti-money-laundering
            obligations.
          </TermsBox>
          <Checkbox label="I accept the Terms & Conditions and Privacy Notice" {...form.register("acceptTerms")} />
          {errors.acceptTerms && <p className="text-[13px] font-medium text-rose-600">{errors.acceptTerms.message}</p>}
          {Object.keys(errors).length > 0 && !errors.otpCode && !errors.acceptTerms && !errors.otpChallengeId && (
            <Alert tone="danger">Some details on earlier steps need attention.</Alert>
          )}
        </>
      )}
    </WizardFrame>
  );
}
