"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BriefcaseBusiness, CircleCheck, Search, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { DescriptionList } from "@/components/ui/data";
import { FileDrop } from "@/components/ui/file-drop";
import { Checkbox, Field, Input, PasswordInput, PhoneInput, Textarea } from "@/components/ui/form";
import { api } from "@/services";
import { toApiError } from "@/services/errors";
import { agentRegistrationSchema } from "@/lib/validation";
import { formatPhone, maskTail } from "@/lib/utils";
import { msg } from "@/lib/i18n/core";
import { useI18n } from "@/hooks/use-i18n";
import type { OtpChallenge } from "@/types/domain";
import { LanguagePreference, PhoneVerification, RegistrationSuccess, StepIntro, TermsBox, WizardFrame, useWizard, type WizardStep } from "./wizard";

const schema = agentRegistrationSchema.extend({ confirmPassword: z.string(), confirmPin: z.string() });
type Values = z.input<typeof schema>;

const STEPS: WizardStep<Values>[] = [
  { title: msg("Personal details"), fields: ["language", "fullName", "phone", "email", "dateOfBirth", "address"] },
  { title: msg("Outlet & contact"), fields: ["outletName", "businessAddress", "emergencyName", "emergencyRelation", "emergencyPhone"] },
  { title: msg("Agent verification"), fields: ["nidNumber", "nidFront", "nidBack", "photo"] },
  {
    title: msg("Security"),
    fields: ["password", "confirmPassword", "pin", "confirmPin"],
    check: (v) => [
      ...(v.password !== v.confirmPassword ? [{ field: "confirmPassword" as const, message: msg("Passwords don't match") }] : []),
      ...(v.pin !== v.confirmPin ? [{ field: "confirmPin" as const, message: msg("PINs don't match") }] : []),
    ],
  },
  { title: msg("Review & submit"), fields: ["otpChallengeId", "otpCode", "acceptTerms"] },
];

const STATUS_FLOW = [
  { icon: Send, label: msg("Application Submitted"), text: msg("We receive your details and documents.") },
  { icon: Search, label: msg("Under Review"), text: msg("Our team checks your NID, photo and outlet.") },
  { icon: ShieldCheck, label: msg("Verified"), text: msg("Cash In / Cash Out and recharge are enabled.") },
];

export function AgentRegistration() {
  const { t, lang } = useI18n();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      language: lang, fullName: "", phone: "", email: "", dateOfBirth: "", address: "", outletName: "", businessAddress: "", emergencyName: "", emergencyRelation: "", emergencyPhone: "",
      nidNumber: "", password: "", confirmPassword: "", pin: "", confirmPin: "", otpChallengeId: "", otpCode: "", acceptTerms: false,
    },
  });
  const wizard = useWizard(form, STEPS);
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [done, setDone] = useState<{ code: string } | null>(null);
  const { errors, isSubmitting } = form.formState;
  const v = form.watch();
  useEffect(() => form.setValue("language", lang), [form, lang]);

  const submit = form.handleSubmit(
    async (values) => {
      try {
        const res = await api.registration.registerAgent(values);
        setDone({ code: res.applicationId });
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
        title={t("Application submitted")}
        message={t("Thanks for applying to become a Kosh agent. You can sign in now to track your application.")}
        details={[
          { label: t("Agent code"), value: <span className="tabular font-mono">{done.code}</span> },
          { label: t("Outlet"), value: v.outletName },
          { label: t("Status"), value: t("Application Submitted") },
        ]}
        note={t("Agent operations (Cash In, Cash Out, Recharge) stay locked until an administrator verifies your documents — usually within 1–3 business days.")}
      />
    );
  }

  return (
    <WizardFrame
      tone="agent"
      icon={<BriefcaseBusiness className="h-5 w-5" aria-hidden />}
      title={t("Agent application")}
      subtitle={t("For authorised financial service agents")}
      steps={STEPS.map((s) => t(s.title))}
      step={wizard.step}
      onBack={wizard.back}
      onNext={wizard.isLast ? submit : wizard.next}
      isLast={wizard.isLast}
      submitting={isSubmitting}
      submitLabel={t("Submit application")}
    >
      {wizard.step === 0 && (
        <>
          <StepIntro title={t("Applicant details")}>{t("The person responsible for the agent outlet.")}</StepIntro>
          <LanguagePreference value={v.language ?? lang} onChange={(l) => form.setValue("language", l)} />
          <Field label={t("Full name")} required error={errors.fullName?.message}>
            {(p) => <Input {...p} autoComplete="name" {...form.register("fullName")} />}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("Mobile number")} required error={errors.phone?.message} hint={t("Your agent wallet number")}>
              {(p) => <PhoneInput {...p} {...form.register("phone")} />}
            </Field>
            <Field label={t("Email")} required error={errors.email?.message}>
              {(p) => <Input {...p} type="email" autoComplete="email" {...form.register("email")} />}
            </Field>
          </div>
          <Field label={t("Date of birth")} required error={errors.dateOfBirth?.message}>
            {(p) => <Input {...p} type="date" {...form.register("dateOfBirth")} />}
          </Field>
          <Field label={t("Home address")} required error={errors.address?.message}>
            {(p) => <Textarea {...p} rows={2} {...form.register("address")} />}
          </Field>
        </>
      )}

      {wizard.step === 1 && (
        <>
          <StepIntro title={t("Outlet & emergency contact")}>{t("Where customers will visit you, and who we can reach in an emergency.")}</StepIntro>
          <Field label={t("Outlet / shop name")} required error={errors.outletName?.message}>
            {(p) => <Input {...p} placeholder={t("e.g. Rahman Telecom")} {...form.register("outletName")} />}
          </Field>
          <Field label={t("Agent / business address")} required error={errors.businessAddress?.message}>
            {(p) => <Textarea {...p} rows={2} placeholder={t("Shop no., market, road, area, city")} {...form.register("businessAddress")} />}
          </Field>
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label={t("Emergency contact name")} required error={errors.emergencyName?.message} className="sm:col-span-1">
              {(p) => <Input {...p} {...form.register("emergencyName")} />}
            </Field>
            <Field label={t("Relationship")} required error={errors.emergencyRelation?.message}>
              {(p) => <Input {...p} placeholder={t("e.g. Spouse")} {...form.register("emergencyRelation")} />}
            </Field>
            <Field label={t("Contact mobile")} required error={errors.emergencyPhone?.message}>
              {(p) => <PhoneInput {...p} {...form.register("emergencyPhone")} />}
            </Field>
          </div>
        </>
      )}

      {wizard.step === 2 && (
        <>
          <StepIntro title={t("Agent verification")}>{t("Agents handle customers' cash, so identity documents are mandatory. An administrator reviews every application.")}</StepIntro>
          <ol className="grid gap-2 sm:grid-cols-3">
            {STATUS_FLOW.map(({ icon: Icon, label, text }, i) => (
              <li key={label} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-accent-100 text-[11px] font-bold text-accent-700">{i + 1}</span>
                  <Icon className="h-4 w-4 text-slate-400" aria-hidden /> {t(label)}
                </p>
                <p className="mt-1 text-xs text-slate-500">{t(text)}</p>
              </li>
            ))}
          </ol>
          <p className="text-xs text-slate-500">{t("Applications may also be marked Rejected (with a reason) or Suspended later.")}</p>
          <Field label={t("National ID number")} required error={errors.nidNumber?.message} hint={t("10, 13 or 17 digits")}>
            {(p) => <Input {...p} inputMode="numeric" {...form.register("nidNumber")} />}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Controller control={form.control} name="nidFront" render={({ field }) => <FileDrop required label={t("NID — front")} purpose="NID" value={field.value} onChange={field.onChange} error={errors.nidFront?.message} />} />
            <Controller control={form.control} name="nidBack" render={({ field }) => <FileDrop required label={t("NID — back")} purpose="NID" value={field.value} onChange={field.onChange} error={errors.nidBack?.message} />} />
          </div>
          <Controller
            control={form.control}
            name="photo"
            render={({ field }) => <FileDrop required label={t("Recent photograph")} hint={t("Clear, front-facing photo · JPG or PNG · up to 5 MB")} purpose="PHOTO" value={field.value} onChange={field.onChange} error={errors.photo?.message} />}
          />
        </>
      )}

      {wizard.step === 3 && (
        <>
          <StepIntro title={t("Security")}>{t("Your PIN authorises every counter transaction.")}</StepIntro>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("Password")} required error={errors.password?.message} hint={t("8+ chars, upper & lower case, number, symbol")}>
              {(p) => <PasswordInput {...p} autoComplete="new-password" strengthOf={v.password} {...form.register("password")} />}
            </Field>
            <Field label={t("Confirm password")} required error={errors.confirmPassword?.message}>
              {(p) => <PasswordInput {...p} autoComplete="new-password" {...form.register("confirmPassword")} />}
            </Field>
            <Field label={t("Transaction PIN")} required error={errors.pin?.message} hint={t("5 digits")}>
              {(p) => <Input {...p} type="password" inputMode="numeric" maxLength={5} className="tracking-[0.5em]" {...form.register("pin")} />}
            </Field>
            <Field label={t("Confirm PIN")} required error={errors.confirmPin?.message}>
              {(p) => <Input {...p} type="password" inputMode="numeric" maxLength={5} className="tracking-[0.5em]" {...form.register("confirmPin")} />}
            </Field>
          </div>
        </>
      )}

      {wizard.step === 4 && (
        <>
          <StepIntro title={t("Review your application")} />
          <div className="rounded-2xl bg-slate-50 px-4">
            <DescriptionList
              items={[
                { label: t("Applicant"), value: v.fullName },
                { label: t("Mobile"), value: formatPhone(v.phone) },
                { label: t("Outlet"), value: v.outletName },
                { label: t("Outlet address"), value: v.businessAddress },
                { label: t("NID"), value: v.nidNumber ? maskTail(v.nidNumber) : "—" },
                {
                  label: t("Documents"),
                  value: (
                    <span className="inline-flex items-center gap-1 text-emerald-700">
                      <CircleCheck className="h-4 w-4" aria-hidden /> {t("{n} of {total} uploaded", { n: [v.nidFront, v.nidBack, v.photo].filter(Boolean).length, total: 3 })}
                    </span>
                  ),
                },
              ]}
            />
          </div>
          <PhoneVerification
            phone={v.phone}
            challenge={challenge}
            onChallenge={(c) => {
              setChallenge(c);
              form.setValue("otpChallengeId", c.challengeId);
              form.clearErrors("otpChallengeId");
            }}
            code={v.otpCode}
            onCode={(c) => form.setValue("otpCode", c, { shouldValidate: c.length === 6 })}
            error={errors.otpChallengeId?.message ?? errors.otpCode?.message}
          />
          <TermsBox>
            {t("Agent Agreement (demo): agents must verify each customer's identity for cash transactions, never request a customer's PIN, keep sufficient float and cash, display the official fee chart, and report suspicious activity. Commissions are credited per transaction according to the published schedule. Kosh may suspend agents for policy breaches.")}
          </TermsBox>
          <Checkbox label={t("I agree to the Agent Agreement and confirm the information is accurate")} {...form.register("acceptTerms")} />
          {errors.acceptTerms?.message && <p className="text-[13px] font-medium text-rose-600">{t(errors.acceptTerms.message)}</p>}
        </>
      )}
    </WizardFrame>
  );
}
