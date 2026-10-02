"use client";

import { useState } from "react";
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
import type { OtpChallenge } from "@/types/domain";
import { PhoneVerification, RegistrationSuccess, StepIntro, TermsBox, WizardFrame, useWizard, type WizardStep } from "./wizard";

const schema = agentRegistrationSchema.extend({ confirmPassword: z.string(), confirmPin: z.string() });
type Values = z.input<typeof schema>;

const STEPS: WizardStep<Values>[] = [
  { title: "Personal details", fields: ["fullName", "phone", "email", "dateOfBirth", "address"] },
  { title: "Outlet & contact", fields: ["outletName", "businessAddress", "emergencyName", "emergencyRelation", "emergencyPhone"] },
  { title: "Agent verification", fields: ["nidNumber", "nidFront", "nidBack", "photo"] },
  {
    title: "Security",
    fields: ["password", "confirmPassword", "pin", "confirmPin"],
    check: (v) => [
      ...(v.password !== v.confirmPassword ? [{ field: "confirmPassword" as const, message: "Passwords don't match" }] : []),
      ...(v.pin !== v.confirmPin ? [{ field: "confirmPin" as const, message: "PINs don't match" }] : []),
    ],
  },
  { title: "Review & submit", fields: ["otpChallengeId", "otpCode", "acceptTerms"] },
];

const STATUS_FLOW = [
  { icon: Send, label: "Application Submitted", text: "We receive your details and documents." },
  { icon: Search, label: "Under Review", text: "Our team checks your NID, photo and outlet." },
  { icon: ShieldCheck, label: "Verified", text: "Cash In / Cash Out and recharge are enabled." },
];

export function AgentRegistration() {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      fullName: "", phone: "", email: "", dateOfBirth: "", address: "", outletName: "", businessAddress: "", emergencyName: "", emergencyRelation: "", emergencyPhone: "",
      nidNumber: "", password: "", confirmPassword: "", pin: "", confirmPin: "", otpChallengeId: "", otpCode: "", acceptTerms: false,
    },
  });
  const wizard = useWizard(form, STEPS);
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [done, setDone] = useState<{ code: string } | null>(null);
  const { errors, isSubmitting } = form.formState;
  const v = form.watch();

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
        title="Application submitted"
        message="Thanks for applying to become a Kosh agent. You can sign in now to track your application."
        details={[
          { label: "Agent code", value: <span className="tabular font-mono">{done.code}</span> },
          { label: "Outlet", value: v.outletName },
          { label: "Status", value: "Application Submitted" },
        ]}
        note="Agent operations (Cash In, Cash Out, Recharge) stay locked until an administrator verifies your documents — usually within 1–3 business days."
      />
    );
  }

  return (
    <WizardFrame
      tone="agent"
      icon={<BriefcaseBusiness className="h-5 w-5" aria-hidden />}
      title="Agent application"
      subtitle="For authorised financial service agents"
      steps={STEPS.map((s) => s.title)}
      step={wizard.step}
      onBack={wizard.back}
      onNext={wizard.isLast ? submit : wizard.next}
      isLast={wizard.isLast}
      submitting={isSubmitting}
      submitLabel="Submit application"
    >
      {wizard.step === 0 && (
        <>
          <StepIntro title="Applicant details">The person responsible for the agent outlet.</StepIntro>
          <Field label="Full name" required error={errors.fullName?.message}>
            {(p) => <Input {...p} autoComplete="name" {...form.register("fullName")} />}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Mobile number" required error={errors.phone?.message} hint="Your agent wallet number">
              {(p) => <PhoneInput {...p} {...form.register("phone")} />}
            </Field>
            <Field label="Email" required error={errors.email?.message}>
              {(p) => <Input {...p} type="email" autoComplete="email" {...form.register("email")} />}
            </Field>
          </div>
          <Field label="Date of birth" required error={errors.dateOfBirth?.message}>
            {(p) => <Input {...p} type="date" {...form.register("dateOfBirth")} />}
          </Field>
          <Field label="Home address" required error={errors.address?.message}>
            {(p) => <Textarea {...p} rows={2} {...form.register("address")} />}
          </Field>
        </>
      )}

      {wizard.step === 1 && (
        <>
          <StepIntro title="Outlet & emergency contact">Where customers will visit you, and who we can reach in an emergency.</StepIntro>
          <Field label="Outlet / shop name" required error={errors.outletName?.message}>
            {(p) => <Input {...p} placeholder="e.g. Rahman Telecom" {...form.register("outletName")} />}
          </Field>
          <Field label="Agent / business address" required error={errors.businessAddress?.message}>
            {(p) => <Textarea {...p} rows={2} placeholder="Shop no., market, road, area, city" {...form.register("businessAddress")} />}
          </Field>
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Emergency contact name" required error={errors.emergencyName?.message} className="sm:col-span-1">
              {(p) => <Input {...p} {...form.register("emergencyName")} />}
            </Field>
            <Field label="Relationship" required error={errors.emergencyRelation?.message}>
              {(p) => <Input {...p} placeholder="e.g. Spouse" {...form.register("emergencyRelation")} />}
            </Field>
            <Field label="Contact mobile" required error={errors.emergencyPhone?.message}>
              {(p) => <PhoneInput {...p} {...form.register("emergencyPhone")} />}
            </Field>
          </div>
        </>
      )}

      {wizard.step === 2 && (
        <>
          <StepIntro title="Agent verification">Agents handle customers&apos; cash, so identity documents are mandatory. An administrator reviews every application.</StepIntro>
          <ol className="grid gap-2 sm:grid-cols-3">
            {STATUS_FLOW.map(({ icon: Icon, label, text }, i) => (
              <li key={label} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-accent-100 text-[11px] font-bold text-accent-700">{i + 1}</span>
                  <Icon className="h-4 w-4 text-slate-400" aria-hidden /> {label}
                </p>
                <p className="mt-1 text-xs text-slate-500">{text}</p>
              </li>
            ))}
          </ol>
          <p className="text-xs text-slate-500">Applications may also be marked Rejected (with a reason) or Suspended later.</p>
          <Field label="National ID number" required error={errors.nidNumber?.message} hint="10, 13 or 17 digits">
            {(p) => <Input {...p} inputMode="numeric" {...form.register("nidNumber")} />}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Controller control={form.control} name="nidFront" render={({ field }) => <FileDrop required label="NID — front" purpose="NID" value={field.value} onChange={field.onChange} error={errors.nidFront?.message} />} />
            <Controller control={form.control} name="nidBack" render={({ field }) => <FileDrop required label="NID — back" purpose="NID" value={field.value} onChange={field.onChange} error={errors.nidBack?.message} />} />
          </div>
          <Controller
            control={form.control}
            name="photo"
            render={({ field }) => <FileDrop required label="Recent photograph" hint="Clear, front-facing photo · JPG or PNG · up to 5 MB" purpose="PHOTO" value={field.value} onChange={field.onChange} error={errors.photo?.message} />}
          />
        </>
      )}

      {wizard.step === 3 && (
        <>
          <StepIntro title="Security">Your PIN authorises every counter transaction.</StepIntro>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Password" required error={errors.password?.message} hint="8+ chars, upper & lower case, number, symbol">
              {(p) => <PasswordInput {...p} autoComplete="new-password" strengthOf={v.password} {...form.register("password")} />}
            </Field>
            <Field label="Confirm password" required error={errors.confirmPassword?.message}>
              {(p) => <PasswordInput {...p} autoComplete="new-password" {...form.register("confirmPassword")} />}
            </Field>
            <Field label="Transaction PIN" required error={errors.pin?.message} hint="5 digits">
              {(p) => <Input {...p} type="password" inputMode="numeric" maxLength={5} className="tracking-[0.5em]" {...form.register("pin")} />}
            </Field>
            <Field label="Confirm PIN" required error={errors.confirmPin?.message}>
              {(p) => <Input {...p} type="password" inputMode="numeric" maxLength={5} className="tracking-[0.5em]" {...form.register("confirmPin")} />}
            </Field>
          </div>
        </>
      )}

      {wizard.step === 4 && (
        <>
          <StepIntro title="Review your application" />
          <div className="rounded-2xl bg-slate-50 px-4">
            <DescriptionList
              items={[
                { label: "Applicant", value: v.fullName },
                { label: "Mobile", value: formatPhone(v.phone) },
                { label: "Outlet", value: v.outletName },
                { label: "Outlet address", value: v.businessAddress },
                { label: "NID", value: v.nidNumber ? maskTail(v.nidNumber) : "—" },
                {
                  label: "Documents",
                  value: (
                    <span className="inline-flex items-center gap-1 text-emerald-700">
                      <CircleCheck className="h-4 w-4" aria-hidden /> {[v.nidFront, v.nidBack, v.photo].filter(Boolean).length} of 3 uploaded
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
            Agent Agreement (demo): agents must verify each customer&apos;s identity for cash transactions, never request a customer&apos;s PIN, keep sufficient float and cash, display the official
            fee chart, and report suspicious activity. Commissions are credited per transaction according to the published schedule. Kosh may suspend agents for policy breaches.
          </TermsBox>
          <Checkbox label="I agree to the Agent Agreement and confirm the information is accurate" {...form.register("acceptTerms")} />
          {errors.acceptTerms && <p className="text-[13px] font-medium text-rose-600">{errors.acceptTerms.message}</p>}
        </>
      )}
    </WizardFrame>
  );
}
