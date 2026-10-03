"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CircleCheck, Globe, HeartPulse, MoreHorizontal, ShoppingBag, ShoppingCart, Store, Utensils, Wrench } from "lucide-react";
import { toast } from "sonner";
import { DescriptionList } from "@/components/ui/data";
import { FileDrop } from "@/components/ui/file-drop";
import { Checkbox, Field, Input, PasswordInput, PhoneInput, Textarea } from "@/components/ui/form";
import { api } from "@/services";
import { toApiError } from "@/services/errors";
import { merchantRegistrationSchema } from "@/lib/validation";
import { cn, formatPhone } from "@/lib/utils";
import { msg } from "@/lib/i18n/core";
import { useI18n } from "@/hooks/use-i18n";
import type { BusinessCategory, OtpChallenge } from "@/types/domain";
import { LanguagePreference, PhoneVerification, RegistrationSuccess, StepIntro, TermsBox, WizardFrame, useWizard, type WizardStep } from "./wizard";

const schema = merchantRegistrationSchema.extend({ confirmPassword: z.string(), confirmPin: z.string() });
type Values = z.input<typeof schema>;

export const CATEGORY_META: Record<BusinessCategory, { label: string; icon: typeof Store }> = {
  RESTAURANT: { label: msg("Restaurant"), icon: Utensils },
  GROCERY: { label: msg("Grocery"), icon: ShoppingCart },
  RETAIL: { label: msg("Retail"), icon: ShoppingBag },
  ECOMMERCE: { label: msg("E-commerce"), icon: Globe },
  PHARMACY: { label: msg("Pharmacy"), icon: HeartPulse },
  SERVICES: { label: msg("Services"), icon: Wrench },
  OTHER: { label: msg("Other"), icon: MoreHorizontal },
};

const STEPS: WizardStep<Values>[] = [
  { title: msg("Owner & contact"), fields: ["language", "ownerName", "phone", "email"] },
  { title: msg("Business"), fields: ["businessName", "category", "businessAddress", "registrationNumber", "tradeLicenseNumber", "taxId"] },
  { title: msg("Documents"), fields: ["tradeLicenseDoc", "registrationDoc", "taxDoc", "ownerNidNumber", "ownerNidDoc"] },
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

export function MerchantRegistration() {
  const { t, lang } = useI18n();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      language: lang, ownerName: "", phone: "", email: "", businessName: "", businessAddress: "", registrationNumber: "", tradeLicenseNumber: "", taxId: "", ownerNidNumber: "",
      taxDoc: null, password: "", confirmPassword: "", pin: "", confirmPin: "", otpChallengeId: "", otpCode: "", acceptTerms: false,
    },
  });
  const wizard = useWizard(form, STEPS);
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [done, setDone] = useState<{ merchantId: string } | null>(null);
  const { errors, isSubmitting } = form.formState;
  const v = form.watch();
  useEffect(() => form.setValue("language", lang), [form, lang]);

  const submit = form.handleSubmit(
    async (values) => {
      try {
        const res = await api.registration.registerMerchant(values);
        setDone({ merchantId: res.merchantId });
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
        title={t("Business submitted for verification")}
        message={t("Your merchant account was created. Sign in to follow the verification of your business.")}
        details={[
          { label: t("Business"), value: v.businessName },
          { label: t("Merchant ID"), value: <span className="tabular font-mono">{done.merchantId}</span> },
          { label: t("Status"), value: t("Pending") },
        ]}
        note={t("QR codes and merchant payments are enabled only after your business is verified.")}
      />
    );
  }

  return (
    <WizardFrame
      tone="merchant"
      icon={<Store className="h-5 w-5" aria-hidden />}
      title={t("Merchant account")}
      subtitle={t("For restaurants, shops, businesses and organisations")}
      steps={STEPS.map((s) => t(s.title))}
      step={wizard.step}
      onBack={wizard.back}
      onNext={wizard.isLast ? submit : wizard.next}
      isLast={wizard.isLast}
      submitting={isSubmitting}
      submitLabel={t("Submit for verification")}
    >
      {wizard.step === 0 && (
        <>
          <StepIntro title={t("Business owner")}>{t("The person legally responsible for the business.")}</StepIntro>
          <LanguagePreference value={v.language ?? lang} onChange={(l) => form.setValue("language", l)} />
          <Field label={t("Owner name")} required error={errors.ownerName?.message}>
            {(p) => <Input {...p} autoComplete="name" {...form.register("ownerName")} />}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("Mobile number")} required error={errors.phone?.message} hint={t("Used to sign in and for alerts")}>
              {(p) => <PhoneInput {...p} {...form.register("phone")} />}
            </Field>
            <Field label={t("Business email")} required error={errors.email?.message}>
              {(p) => <Input {...p} type="email" autoComplete="email" {...form.register("email")} />}
            </Field>
          </div>
        </>
      )}

      {wizard.step === 1 && (
        <>
          <StepIntro title={t("About the business")}>{t("These details must match your trade license.")}</StepIntro>
          <Field label={t("Business name")} required error={errors.businessName?.message}>
            {(p) => <Input {...p} placeholder={t("As shown to customers")} {...form.register("businessName")} />}
          </Field>
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-slate-700">
              {t("Business category")} <span className="text-rose-500">*</span>
            </p>
            <Controller
              control={form.control}
              name="category"
              render={({ field }) => (
                <div role="radiogroup" aria-label={t("Business category")} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(Object.keys(CATEGORY_META) as BusinessCategory[]).map((c) => {
                    const { label, icon: Icon } = CATEGORY_META[c];
                    const active = field.value === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => field.onChange(c)}
                        className={cn(
                          "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition",
                          active ? "border-accent-600 bg-accent-50 text-accent-700 ring-2 ring-accent-500/20" : "border-slate-200 text-slate-600 hover:border-slate-300",
                        )}
                      >
                        <Icon className="h-4 w-4" aria-hidden /> {t(label)}
                      </button>
                    );
                  })}
                </div>
              )}
            />
            {errors.category?.message && <p className="text-[13px] font-medium text-rose-600">{t(errors.category.message)}</p>}
          </div>
          <Field label={t("Business address")} required error={errors.businessAddress?.message}>
            {(p) => <Textarea {...p} rows={2} {...form.register("businessAddress")} />}
          </Field>
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label={t("Registration number")} required error={errors.registrationNumber?.message}>
              {(p) => <Input {...p} placeholder={t("e.g. C-178245/2019")} {...form.register("registrationNumber")} />}
            </Field>
            <Field label={t("Trade license number")} required error={errors.tradeLicenseNumber?.message}>
              {(p) => <Input {...p} placeholder={t("e.g. TRAD/DNCC/045812/2024")} {...form.register("tradeLicenseNumber")} />}
            </Field>
            <Field label={t("TIN / BIN")} optional error={errors.taxId?.message} hint={t("Where applicable")}>
              {(p) => <Input {...p} inputMode="numeric" {...form.register("taxId")} />}
            </Field>
          </div>
        </>
      )}

      {wizard.step === 2 && (
        <>
          <StepIntro title={t("Verify the business and its owner")}>{t("An administrator reviews these documents before payments are enabled.")}</StepIntro>
          <div className="grid gap-5 sm:grid-cols-2">
            <Controller control={form.control} name="tradeLicenseDoc" render={({ field }) => <FileDrop required label={t("Trade license")} purpose="BUSINESS_DOCUMENT" value={field.value} onChange={field.onChange} error={errors.tradeLicenseDoc?.message} />} />
            <Controller control={form.control} name="registrationDoc" render={({ field }) => <FileDrop required label={t("Business registration certificate")} purpose="BUSINESS_DOCUMENT" value={field.value} onChange={field.onChange} error={errors.registrationDoc?.message} />} />
          </div>
          <Controller control={form.control} name="taxDoc" render={({ field }) => <FileDrop label={t("TIN / BIN certificate (optional)")} purpose="BUSINESS_DOCUMENT" value={field.value} onChange={field.onChange} />} />
          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="mb-4 text-sm font-semibold text-slate-900">{t("Owner identity verification")}</p>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t("Owner NID number")} required error={errors.ownerNidNumber?.message}>
                {(p) => <Input {...p} inputMode="numeric" {...form.register("ownerNidNumber")} />}
              </Field>
              <Controller control={form.control} name="ownerNidDoc" render={({ field }) => <FileDrop required label={t("Owner NID (front)")} purpose="NID" value={field.value} onChange={field.onChange} error={errors.ownerNidDoc?.message} />} />
            </div>
          </div>
        </>
      )}

      {wizard.step === 3 && (
        <>
          <StepIntro title={t("Security")}>{t("The PIN authorises refunds and settlements.")}</StepIntro>
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
          <StepIntro title={t("Review & submit")} />
          <div className="rounded-2xl bg-slate-50 px-4">
            <DescriptionList
              items={[
                { label: t("Business"), value: v.businessName },
                { label: t("Category"), value: v.category ? t(CATEGORY_META[v.category].label) : "—" },
                { label: t("Owner"), value: v.ownerName },
                { label: t("Mobile"), value: formatPhone(v.phone) },
                { label: t("Trade license"), value: v.tradeLicenseNumber },
                {
                  label: t("Documents"),
                  value: (
                    <span className="inline-flex items-center gap-1 text-emerald-700">
                      <CircleCheck className="h-4 w-4" aria-hidden /> {t("{n} uploaded", { n: [v.tradeLicenseDoc, v.registrationDoc, v.ownerNidDoc, v.taxDoc].filter(Boolean).length })}
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
            {t("Merchant Terms (demo): customers pay a 1.5% service charge on top of each payment; you receive the full amount. Refunds are allowed within 30 days of payment. Settlements are paid to the verified bank account on file. You must not accept payments for prohibited goods or services.")}
          </TermsBox>
          <Checkbox label={t("I accept the Merchant Terms and confirm the business information is accurate")} {...form.register("acceptTerms")} />
          {errors.acceptTerms?.message && <p className="text-[13px] font-medium text-rose-600">{t(errors.acceptTerms.message)}</p>}
        </>
      )}
    </WizardFrame>
  );
}
