"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, CircleCheck, KeyRound } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { CodeInput, DevCodeHint } from "@/components/ui/code-input";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, PasswordInput } from "@/components/ui/form";
import { ResendButton } from "@/components/flows/transaction-flow";
import { api } from "@/services";
import { toApiError } from "@/services/errors";
import { useHydrated } from "@/hooks/use-hydrated";
import { useI18n } from "@/hooks/use-i18n";
import { passwordSchema } from "@/lib/validation";
import type { OtpChallenge } from "@/types/domain";

export function ForgotPassword() {
  const { t } = useI18n();
  const hydrated = useHydrated();
  const [identifier, setIdentifier] = useState("");
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const request = async () => {
    setBusy(true);
    setError(null);
    try {
      setChallenge(await api.auth.requestPasswordReset(identifier));
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    const pw = passwordSchema.safeParse(password);
    if (!pw.success) return setError(pw.error.issues[0].message);
    if (password !== confirm) return setError(t("Passwords don't match"));
    setBusy(true);
    setError(null);
    try {
      await api.auth.resetPassword({ challengeId: challenge!.challengeId, code, newPassword: password });
      setDone(true);
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="text-center">
        <span className="mx-auto grid h-14 w-14 animate-pop place-items-center rounded-full bg-emerald-100 text-emerald-600">
          <CircleCheck className="h-8 w-8" aria-hidden />
        </span>
        <h1 className="mt-4 text-2xl font-bold text-slate-900">{t("Password updated")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("All devices were signed out. Sign in with your new password.")}</p>
        <ButtonLink href="/login" variant="brand" size="lg" fullWidth className="mt-6">
          {t("Go to sign in")}
        </ButtonLink>
      </div>
    );
  }

  return (
    <div>
      <Link href="/login" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t("Back to sign in")}
      </Link>
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-700">
        <KeyRound className="h-6 w-6" aria-hidden />
      </span>
      <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">{t("Reset your password")}</h1>

      {!challenge ? (
        <form
          method="post"
          className="mt-6 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void request();
          }}
        >
          <p className="text-sm text-slate-500">{t("Enter the mobile number or email on your account. We'll send a one-time code to your registered mobile.")}</p>
          <Field label={t("Mobile number or email")}>
            {(p) => <Input {...p} value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder={t("01XXXXXXXXX or you@example.com")} autoComplete="username" />}
          </Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" variant="brand" size="lg" fullWidth loading={busy} disabled={!hydrated || identifier.trim().length < 5}>
            {t("Send code")}
          </Button>
        </form>
      ) : (
        <form
          method="post"
          className="mt-6 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void reset();
          }}
        >
          <p className="text-sm text-slate-500">
            {t("If an account exists, a code was sent to")} <span className="tabular font-medium text-slate-700">{challenge.destinationMasked}</span>.
          </p>
          <div className="space-y-2">
            <CodeInput length={6} value={code} onChange={setCode} label={t("Verification code")} autoFocus />
            <DevCodeHint code={challenge.devCode} />
            <ResendButton challenge={challenge} onResend={() => void request()} disabled={busy} />
          </div>
          <Field label={t("New password")} hint={t("8+ characters with upper & lower case, a number and a symbol")}>
            {(p) => <PasswordInput {...p} value={password} onChange={(e) => setPassword(e.target.value)} strengthOf={password} autoComplete="new-password" />}
          </Field>
          <Field label={t("Confirm new password")}>
            {(p) => <PasswordInput {...p} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />}
          </Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" variant="brand" size="lg" fullWidth loading={busy} disabled={!hydrated || code.length !== 6 || !password}>
            {t("Update password")}
          </Button>
        </form>
      )}
    </div>
  );
}
