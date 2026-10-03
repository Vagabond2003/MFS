"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BadgeCheck,
  CircleCheck,
  CircleX,
  KeyRound,
  Languages,
  LockKeyhole,
  LogOut,
  Mail,
  MapPin,
  MonitorSmartphone,
  Pencil,
  Phone,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { AccountStatusBadge, Badge, DemoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { CodeInput, DevCodeHint } from "@/components/ui/code-input";
import { DescriptionList, Table, Tabs, TD, TH, THead, TR } from "@/components/ui/data";
import { Alert, EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Field, Input, PasswordInput, Switch, Textarea } from "@/components/ui/form";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { AvatarPicker } from "@/components/ui/avatar-picker";
import { ResendButton } from "@/components/flows/transaction-flow";
import { invalidate, useApi } from "@/hooks/use-api";
import { useAuth, useCurrentUser } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { LANGS, LANG_NAME, translator } from "@/lib/i18n/core";
import { cn } from "@/lib/utils";
import { api } from "@/services";
import { toApiError } from "@/services/errors";
import { ROLE_LABEL } from "@/lib/auth/access";
import { formatDate, formatDateTime, formatRelative } from "@/lib/utils";
import { passwordSchema, pinSchema } from "@/lib/validation";
import type { OtpChallenge, ProfileView } from "@/types/domain";
import { DocumentList } from "../shared/verification";

type Tab = "overview" | "security" | "sessions" | "history";

export function ProfilePage() {
  return (
    <Suspense>
      <ProfileInner />
    </Suspense>
  );
}

function ProfileInner() {
  const { t } = useI18n();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = (["overview", "security", "sessions", "history"].includes(params.get("tab") ?? "") ? params.get("tab") : "overview") as Tab;
  const profile = useApi(() => api.profile.get(), [], { tags: ["profile"] });

  return (
    <div>
      <PageHeader title={t("Profile & security")} description={t("Your details, verification, password, PIN and signed-in devices.")} />
      <Tabs<Tab>
        ariaLabel={t("Profile sections")}
        value={tab}
        onChange={(next) => router.replace(`${pathname}?tab=${next}`, { scroll: false })}
        tabs={[
          { value: "overview", label: t("Profile") },
          { value: "security", label: t("Security") },
          { value: "sessions", label: t("Devices & sessions") },
          { value: "history", label: t("Login history") },
        ]}
        className="mb-6 inline-flex max-w-full"
      />
      {profile.error && !profile.data ? (
        <ErrorState message={profile.error.message} onRetry={profile.reload} />
      ) : !profile.data ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : tab === "overview" ? (
        <Overview profile={profile.data} />
      ) : tab === "security" ? (
        <Security />
      ) : tab === "sessions" ? (
        <Sessions />
      ) : (
        <LoginHistory />
      )}
    </div>
  );
}

/* ───────────── Overview ───────────── */

function Overview({ profile: p }: { profile: ProfileView }) {
  const { t, lang } = useI18n();
  const { refresh } = useAuth();
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState(p.user.email ?? "");
  const [address, setAddress] = useState(p.address ?? "");
  const [saving, setSaving] = useState(false);
  const canEditAddress = p.user.role === "PERSONAL" || p.user.role === "AGENT";

  const save = async () => {
    setSaving(true);
    try {
      await api.profile.update({ email: email.trim() || null, ...(canEditAddress ? { address } : {}) });
      toast.success(t("Profile updated"));
      setEditing(false);
      invalidate("profile");
      void refresh();
    } catch (e) {
      toast.error(toApiError(e).message);
    } finally {
      setSaving(false);
    }
  };

  const verifyHref = p.user.role === "AGENT" ? "/dashboard/agent/verification" : p.user.role === "MERCHANT" ? "/dashboard/merchant/business" : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="space-y-6">
        <Card className="p-6 text-center">
          <AvatarPicker
            name={p.user.businessName ?? p.user.name}
            currentUrl={p.user.avatarUrl}
            className="justify-center text-left"
            onUploaded={async (ref) => {
              await api.profile.setAvatar(ref.uploadId);
              toast.success(t("Profile picture updated"));
              invalidate("profile", "transactions");
              void refresh();
            }}
            onRemove={async () => {
              await api.profile.setAvatar(null);
              toast.success(t("Profile picture removed"));
              invalidate("profile", "transactions");
              void refresh();
            }}
          />
          <p className="mt-4 flex items-center justify-center gap-2 text-lg font-bold text-slate-900">
            {p.user.businessName ?? p.user.name} {p.user.isDemo && <DemoBadge />}
          </p>
          {p.user.businessName && <p className="text-sm text-slate-500">{t("Owner:")} {p.user.name}</p>}
          <p className="mt-1 text-sm font-medium text-accent-700">{t("{role} account", { role: t(ROLE_LABEL[p.user.role]) })}</p>
          <div className="mt-3 flex justify-center">
            <AccountStatusBadge status={p.user.status} />
          </div>
          <p className="mt-4 text-xs text-slate-400">{t("Member since {date}", { date: formatDate(p.user.createdAt, lang) })}</p>
        </Card>
        <Card>
          <CardHeader title={t("Verification")} icon={<BadgeCheck className="h-[18px] w-[18px]" />} />
          <CardBody className="space-y-4">
            <DescriptionList
              items={[
                { label: t("Status"), value: <AccountStatusBadge status={p.user.status} /> },
                { label: t("National ID"), value: p.nidMasked ?? t("Not provided") },
                ...(p.selfieStatus ? [{ label: t("Selfie check"), value: p.selfieStatus === "VERIFIED" ? t("Passed") : p.selfieStatus === "NOT_SUBMITTED" ? t("Not submitted") : p.selfieStatus === "FAILED" ? t("Failed") : t("Pending") }] : []),
                ...(p.agent ? [{ label: t("Agent code"), value: p.agent.agentCode }] : []),
                ...(p.merchant ? [{ label: t("Merchant ID"), value: p.merchant.merchantId }] : []),
              ]}
            />
            {p.user.role === "PERSONAL" && p.user.status === "PENDING_VERIFICATION" && (
              <Alert tone="warning" title={t("Complete e-KYC")}>
                {t("Identity verification raises your limits to ৳25,000 per transaction. Our compliance team reviews pending accounts (in this demo, an administrator can approve you from the admin console → Users).")}
              </Alert>
            )}
            {verifyHref && (
              <Link href={verifyHref} className="inline-flex text-sm font-semibold text-accent-700 hover:underline">
                {t("View verification details →")}
              </Link>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="space-y-6">
        <LanguageSetting />
        <Card>
          <CardHeader
            title={t("Contact details")}
            action={
              !editing && (
                <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4" aria-hidden /> {t("Edit")}
                </Button>
              )
            }
          />
          <CardBody>
            {editing ? (
              <div className="space-y-4">
                <Field label={t("Mobile number")} hint={t("Your wallet number can't be changed online — visit a service point.")}>
                  {(f) => <Input {...f} value={p.user.phone} disabled />}
                </Field>
                <Field label={t("Email")} optional={p.user.role === "PERSONAL"}>
                  {(f) => <Input {...f} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
                </Field>
                {canEditAddress ? (
                  <Field label={t("Address")}>
                    {(f) => <Textarea {...f} rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />}
                  </Field>
                ) : (
                  <Alert tone="info">{t("Business address changes require re-verification. Contact support to update it.")}</Alert>
                )}
                <div className="flex gap-2">
                  <Button onClick={save} loading={saving}>
                    {t("Save changes")}
                  </Button>
                  <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>
                    {t("Cancel")}
                  </Button>
                </div>
              </div>
            ) : (
              <ul className="space-y-4 text-sm">
                <li className="flex items-start gap-3">
                  <Phone className="mt-0.5 h-4 w-4 text-slate-400" aria-hidden />
                  <div>
                    <p className="text-slate-500">{t("Phone number")}</p>
                    <p className="tabular font-medium text-slate-900">{p.user.phone}</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Mail className="mt-0.5 h-4 w-4 text-slate-400" aria-hidden />
                  <div>
                    <p className="text-slate-500">{t("Email")}</p>
                    <p className="font-medium text-slate-900">{p.user.email ?? t("Not added")}</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 text-slate-400" aria-hidden />
                  <div>
                    <p className="text-slate-500">{p.merchant ? t("Business address") : t("Address")}</p>
                    <p className="font-medium text-slate-900">{p.address ?? "—"}</p>
                  </div>
                </li>
                {p.dateOfBirth && (
                  <li className="flex items-start gap-3">
                    <CircleCheck className="mt-0.5 h-4 w-4 text-slate-400" aria-hidden />
                    <div>
                      <p className="text-slate-500">{t("Date of birth")}</p>
                      <p className="font-medium text-slate-900">{formatDate(p.dateOfBirth, lang)}</p>
                    </div>
                  </li>
                )}
              </ul>
            )}
          </CardBody>
        </Card>
        {p.documents.length > 0 && (
          <Card>
            <CardHeader title={t("Identity documents")} />
            <CardBody>
              <DocumentList documents={p.documents} />
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}

/* ───────────── Language ───────────── */

/** Saved to the account, so it follows the user to every device. */
function LanguageSetting() {
  const { t, lang, setLang } = useI18n();
  return (
    <Card>
      <CardHeader title={t("Language")} description={t("Choose the language Kosh uses for you. It's saved to your account.")} icon={<Languages className="h-[18px] w-[18px]" />} />
      <CardBody>
        <div role="radiogroup" aria-label={t("Language")} className="grid grid-cols-2 gap-3">
          {LANGS.map((l) => {
            const active = l === lang;
            return (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={async () => {
                  await setLang(l);
                  toast.success(translator(l)("Language updated"));
                }}
                className={cn(
                  "flex items-center justify-between rounded-xl border px-4 py-3 text-left transition",
                  active ? "border-accent-500 bg-accent-50 ring-2 ring-accent-500/20" : "border-slate-200 hover:border-slate-300",
                )}
              >
                <span lang={l} className="text-sm font-semibold text-slate-900">
                  {LANG_NAME[l]}
                </span>
                {active && <CircleCheck className="h-4 w-4 text-accent-600" aria-hidden />}
              </button>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}

/* ───────────── Security ───────────── */

function Security() {
  const { t } = useI18n();
  const user = useCurrentUser();
  const { refresh } = useAuth();
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ChangePassword />
      <ChangePin />
      <TwoFactor enabled={user.twoFactorEnabled} isAdmin={user.role === "ADMIN"} onChanged={() => void refresh()} />
      <Card>
        <CardHeader title={t("Transaction protection")} icon={<ShieldCheck className="h-[18px] w-[18px]" />} />
        <CardBody>
          <ul className="space-y-3 text-sm text-slate-600">
            {[
              t("Every payment requires your 5-digit transaction PIN."),
              t("Payments of ৳10,000 or more also need a one-time code sent to your phone."),
              t("3 wrong PIN attempts lock the PIN for 15 minutes."),
              t("5 wrong passwords lock sign-in for 15 minutes."),
              t("Fees, limits and balances are always calculated on the server."),
            ].map((rule) => (
              <li key={rule} className="flex items-start gap-2">
                <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden /> {rule}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

function ChangePassword() {
  const { t } = useI18n();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = passwordSchema.safeParse(next);
    if (!v.success) return setError(v.error.issues[0].message);
    if (next !== confirm) return setError(t("New passwords don't match"));
    setBusy(true);
    setError(null);
    try {
      await api.security.changePassword({ currentPassword: current, newPassword: next });
      toast.success(t("Password changed. Other devices were signed out."));
      setCurrent("");
      setNext("");
      setConfirm("");
      invalidate("notifications");
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title={t("Change password")} icon={<LockKeyhole className="h-[18px] w-[18px]" />} />
      <CardBody>
        <form className="space-y-4" onSubmit={submit} noValidate>
          <Field label={t("Current password")}>{(p) => <PasswordInput {...p} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />}</Field>
          <Field label={t("New password")} hint={t("8+ chars, upper & lower case, number, symbol")}>
            {(p) => <PasswordInput {...p} autoComplete="new-password" strengthOf={next} value={next} onChange={(e) => setNext(e.target.value)} />}
          </Field>
          <Field label={t("Confirm new password")}>{(p) => <PasswordInput {...p} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}</Field>
          {error && <Alert tone="danger">{t(error)}</Alert>}
          <Button type="submit" loading={busy} disabled={!current || !next}>
            {t("Update password")}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

function ChangePin() {
  const { t } = useI18n();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    try {
      setChallenge(await api.security.requestPinChangeOtp());
      toast.success(t("Code sent to your phone"));
    } catch (e) {
      toast.error(toApiError(e).message);
    }
  };

  const submit = async () => {
    const v = pinSchema.safeParse(next);
    if (!v.success) return setError(v.error.issues[0].message);
    if (next !== confirm) return setError(t("New PINs don't match"));
    if (!challenge) return setError(t("Request a verification code first"));
    setBusy(true);
    setError(null);
    try {
      await api.security.changePin({ currentPin: current, newPin: next, challengeId: challenge.challengeId, code });
      toast.success(t("PIN changed"));
      setCurrent("");
      setNext("");
      setConfirm("");
      setCode("");
      setChallenge(null);
      invalidate("notifications");
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title={t("Change transaction PIN")} description={t("Requires your current PIN and a one-time code")} icon={<KeyRound className="h-[18px] w-[18px]" />} />
      <CardBody className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">{t("Current PIN")}</p>
          <CodeInput length={5} secret value={current} onChange={setCurrent} label={t("Current PIN")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">{t("New PIN")}</p>
            <CodeInput length={5} secret value={next} onChange={setNext} label={t("New PIN")} />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">{t("Confirm new PIN")}</p>
            <CodeInput length={5} secret value={confirm} onChange={setConfirm} label={t("Confirm new PIN")} />
          </div>
        </div>
        {challenge ? (
          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <p className="text-sm font-medium text-slate-700">{t("Verification code")}</p>
            <CodeInput length={6} value={code} onChange={setCode} label={t("Verification code")} />
            <DevCodeHint code={challenge.devCode} />
            <ResendButton challenge={challenge} onResend={sendCode} />
          </div>
        ) : (
          <Button variant="soft" onClick={sendCode} disabled={current.length !== 5}>
            <Smartphone className="h-4 w-4" aria-hidden /> {t("Send verification code")}
          </Button>
        )}
        {error && <Alert tone="danger">{t(error)}</Alert>}
        <Button onClick={submit} loading={busy} disabled={current.length !== 5 || next.length !== 5 || confirm.length !== 5 || code.length !== 6}>
          {t("Change PIN")}
        </Button>
      </CardBody>
    </Card>
  );
}

function TwoFactor({ enabled, isAdmin, onChanged }: { enabled: boolean; isAdmin: boolean; onChanged: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = !enabled;

  const close = () => {
    setOpen(false);
    setPassword("");
    setChallenge(null);
    setCode("");
    setError(null);
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.security.setTwoFactor({ enabled: target, password, challengeId: challenge?.challengeId, code });
      toast.success(target ? t("Two-factor sign-in enabled") : t("Two-factor sign-in disabled"));
      onChanged();
      invalidate("notifications");
      close();
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title={t("Two-factor authentication")} description={t("Ask for a one-time code when signing in")} icon={<ShieldCheck className="h-[18px] w-[18px]" />} />
      <CardBody>
        <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 p-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">{t("OTP at sign-in")}</p>
            <p className="text-xs text-slate-500">{enabled ? t("On — a code is sent to your phone every time you sign in.") : t("Off — sign in with password only.")}</p>
          </div>
          <Switch checked={enabled} onChange={() => setOpen(true)} label={t("Two-factor authentication")} disabled={isAdmin && enabled} />
        </div>
        {isAdmin && <p className="mt-3 text-xs text-slate-500">{t("Mandatory for administrator accounts.")}</p>}
      </CardBody>
      <Modal
        open={open}
        onClose={close}
        title={target ? t("Turn on two-factor sign-in") : t("Turn off two-factor sign-in")}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={close} disabled={busy}>
              {t("Cancel")}
            </Button>
            <Button onClick={confirm} loading={busy} disabled={!password || (target && code.length !== 6)}>
              {t("Confirm")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t("Your password")}>{(p) => <PasswordInput {...p} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />}</Field>
          {target &&
            (challenge ? (
              <div className="space-y-2">
                <CodeInput length={6} value={code} onChange={setCode} label={t("Verification code")} />
                <DevCodeHint code={challenge.devCode} />
              </div>
            ) : (
              <Button
                variant="soft"
                onClick={async () => {
                  try {
                    setChallenge(await api.security.requestTwoFactorOtp());
                  } catch (e) {
                    setError(toApiError(e).message);
                  }
                }}
              >
                {t("Send code to my phone")}
              </Button>
            ))}
          {error && <Alert tone="danger">{t(error)}</Alert>}
        </div>
      </Modal>
    </Card>
  );
}

/* ───────────── Sessions ───────────── */

function Sessions() {
  const { t, lang } = useI18n();
  const { signOut } = useAuth();
  const sessions = useApi(() => api.security.sessions(), [], { tags: ["profile"] });
  const [revoke, setRevoke] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  return (
    <Card>
      <CardHeader
        title={t("Active sessions")}
        description={t("Devices currently signed in to your account")}
        icon={<MonitorSmartphone className="h-[18px] w-[18px]" />}
        action={
          <Button variant="danger" size="sm" onClick={() => setAll(true)}>
            <LogOut className="h-4 w-4" aria-hidden /> {t("Log out from all devices")}
          </Button>
        }
      />
      <CardBody>
        {sessions.loading ? (
          <Skeleton className="h-32" />
        ) : !sessions.data?.length ? (
          <EmptyState title={t("No active sessions")} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {sessions.data.map((s) => (
              <li key={s.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
                  <MonitorSmartphone className="h-5 w-5" aria-hidden />
                </span>
                <div className="flex-1">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    {s.device} {s.current && <Badge tone="success">{t("This device")}</Badge>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {s.location} · IP {s.ipMasked} · {t("signed in {date}", { date: formatDate(s.createdAt, lang) })} · {t("active {when}", { when: formatRelative(s.lastActiveAt, lang) })}
                  </p>
                </div>
                {!s.current && (
                  <Button variant="outline" size="sm" onClick={() => setRevoke(s.id)}>
                    {t("Sign out")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
      <ConfirmDialog
        open={!!revoke}
        onClose={() => setRevoke(null)}
        title={t("Sign out this device?")}
        description={t("That device will need to sign in again.")}
        confirmLabel={t("Sign out device")}
        tone="danger"
        onConfirm={async () => {
          try {
            await api.security.revokeSession(revoke!);
            toast.success(t("Device signed out"));
            sessions.reload();
          } catch (e) {
            toast.error(toApiError(e).message);
          }
        }}
      />
      <ConfirmDialog
        open={all}
        onClose={() => setAll(false)}
        title={t("Log out from all devices?")}
        description={t("Every session, including this one, will end immediately.")}
        confirmLabel={t("Log out everywhere")}
        tone="danger"
        onConfirm={() => signOut({ everywhere: true })}
      />
    </Card>
  );
}

function LoginHistory() {
  const { t, lang } = useI18n();
  const history = useApi(() => api.security.loginHistory(), []);
  return (
    <Card>
      <CardHeader title={t("Login history")} description={t("Recent sign-in attempts on your account")} />
      <div className="mt-4">
        {history.loading ? (
          <Skeleton className="m-6 h-40" />
        ) : !history.data?.length ? (
          <EmptyState title={t("No sign-ins recorded")} />
        ) : (
          <Table>
            <THead>
              <TH>{t("Result")}</TH>
              <TH>{t("Method")}</TH>
              <TH>{t("Device")}</TH>
              <TH>{t("Location")}</TH>
              <TH>{t("When")}</TH>
            </THead>
            <tbody>
              {history.data.map((h) => (
                <TR key={h.id}>
                  <TD>
                    {h.success ? (
                      <Badge tone="success" icon={<CircleCheck className="h-3.5 w-3.5" aria-hidden />}>{t("Success")}</Badge>
                    ) : (
                      <Badge tone="danger" icon={<CircleX className="h-3.5 w-3.5" aria-hidden />}>{t(h.reason ?? "Failed")}</Badge>
                    )}
                  </TD>
                  <TD className="text-slate-600">{h.method === "PASSWORD_OTP" ? t("Password + OTP") : t("Password")}</TD>
                  <TD className="text-slate-600">{h.device}</TD>
                  <TD className="text-slate-600">
                    {h.location} · {h.ipMasked}
                  </TD>
                  <TD className="whitespace-nowrap text-slate-500">{formatDateTime(h.createdAt, lang)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </Card>
  );
}
