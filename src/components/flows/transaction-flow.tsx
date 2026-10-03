"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CircleCheck, CircleX, Copy, KeyRound, LockKeyhole, MessageSquareText, Clock3 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { CodeInput, DevCodeHint } from "@/components/ui/code-input";
import { DescriptionList, Stepper } from "@/components/ui/data";
import { Alert } from "@/components/ui/feedback";
import { Avatar } from "@/components/ui/popover";
import { TransactionDetail } from "@/components/transactions/transaction-detail";
import { TXN_META } from "@/components/transactions/meta";
import { invalidateLedger } from "@/hooks/use-api";
import { ApiError, api } from "@/services";
import { toApiError } from "@/services/errors";
import { cn, formatDateTime, formatMoney, newIdempotencyKey } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import type { OperationQuote, OperationRequest, OperationResult, OtpChallenge } from "@/types/domain";

type Step = "form" | "review" | "done";

export interface FlowFormContext {
  /** Ask the server to validate & price the request, then move to review. */
  submit: (req: OperationRequest) => Promise<void>;
  busy: boolean;
}

/**
 * Shared three-step money-movement flow:
 *   1. details (page-specific form)
 *   2. review — server quote (fees, counterparty, balance after), PIN, step-up OTP
 *   3. receipt
 * The client never computes fees or balances; it renders what the API returns,
 * and the API re-validates everything again on execute.
 */
export function TransactionFlow({
  renderForm,
  confirmLabel,
  pinLabel,
  doneHref,
  onDone,
  aside,
  locked,
}: {
  renderForm: (ctx: FlowFormContext) => React.ReactNode;
  confirmLabel?: string | ((q: OperationQuote) => string);
  pinLabel?: string;
  doneHref: string;
  /** Called instead of navigating to doneHref (e.g. to close a modal). */
  onDone?: () => void;
  aside?: React.ReactNode;
  /** When set, the flow is disabled and this message is shown instead. */
  locked?: React.ReactNode;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState<Step>("form");
  const [busy, setBusy] = useState(false);
  const [request, setRequest] = useState<OperationRequest | null>(null);
  const [quote, setQuote] = useState<OperationQuote | null>(null);
  const [pin, setPin] = useState("");
  const [otp, setOtp] = useState("");
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [result, setResult] = useState<OperationResult | null>(null);
  const [idemKey, setIdemKey] = useState("");
  const [showReceipt, setShowReceipt] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const submit = async (req: OperationRequest) => {
    setBusy(true);
    setError(null);
    try {
      const q = await api.operations.quote(req);
      setRequest(req);
      setQuote(q);
      setPin("");
      setOtp("");
      setChallenge(null);
      setIdemKey(newIdempotencyKey());
      setStep("review");
    } catch (e) {
      const err = toApiError(e);
      setError(err);
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const sendOtp = async () => {
    if (!request) return;
    setBusy(true);
    try {
      setChallenge(await api.operations.requestOtp(request));
      setOtp("");
      toast.success(quote?.otpTarget === "CUSTOMER" ? t("Code sent to the customer") : t("Code sent to {destination}", { destination: quote?.otpDestination ?? t("your phone") }));
    } catch (e) {
      toast.error(toApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!request || !quote) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.operations.execute(request, {
        pin,
        idempotencyKey: idemKey,
        otp: quote.requiresOtp && challenge ? { challengeId: challenge.challengeId, code: otp } : undefined,
      });
      setResult(res);
      setStep("done");
      invalidateLedger();
      if (res.transaction.status === "SUCCESSFUL" || res.transaction.status === "PENDING") {
        const type = t(TXN_META[res.transaction.type].label);
        toast.success(res.transaction.status === "PENDING" ? t("{type} submitted", { type }) : t("{type} successful", { type }));
      }
    } catch (e) {
      const err = toApiError(e);
      setError(err);
      if (err.code === "INVALID_PIN" || err.code === "PIN_LOCKED") setPin("");
      if (err.code === "INVALID_OTP" || err.code === "OTP_EXPIRED") setOtp("");
    } finally {
      setBusy(false);
    }
  };

  const restart = () => {
    setStep("form");
    setRequest(null);
    setQuote(null);
    setResult(null);
    setError(null);
    setFormKey((k) => k + 1);
  };

  const stepIndex = step === "form" ? 0 : step === "review" ? 1 : 2;
  const otpReady = !quote?.requiresOtp || (challenge && otp.length === 6);
  const label = quote ? (typeof confirmLabel === "function" ? confirmLabel(quote) : confirmLabel ?? t("Confirm")) : "";

  return (
    <div className={cn("grid gap-6", aside && "lg:grid-cols-[minmax(0,1fr)_340px]")}>
      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
          <Stepper steps={[t("Details"), t("Review & authorise"), t("Receipt")]} current={stepIndex} />
        </div>

        {locked ? (
          <CardBody>
            <div className="flex flex-col items-center px-4 py-10 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-500">
                <LockKeyhole className="h-6 w-6" aria-hidden />
              </span>
              <div className="mt-4 max-w-md text-sm text-slate-600">{locked}</div>
            </div>
          </CardBody>
        ) : (
          <>
            {/* Keep the form mounted so "Back" restores what was typed. */}
            <div className={cn(step !== "form" && "hidden")}>
              <CardBody key={formKey}>
                {error && step === "form" && (
                  <Alert tone="danger" className="mb-5">
                    {error.message}
                  </Alert>
                )}
                {renderForm({ submit, busy })}
              </CardBody>
            </div>

            {step === "review" && quote && (
              <CardBody className="animate-fade-in space-y-6">
                <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4">
                  <Avatar name={t(quote.counterparty.name)} src={quote.counterparty.avatarUrl} className="h-12 w-12 ring-0" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{t(quote.counterparty.name)}</p>
                    <p className="tabular text-sm text-slate-500">{quote.counterparty.account}</p>
                  </div>
                </div>

                <DescriptionList items={quote.summary.map((r) => ({ label: t(r.label), value: r.emphasis ? <span className="text-base font-bold">{t(r.value)}</span> : t(r.value) }))} />

                {quote.kind !== "AGENT_CASH_OUT" && (
                  <p className="text-xs text-slate-500">
                    {t("Balance after this transaction:")} <span className="tabular font-semibold text-slate-700">{formatMoney(quote.balanceAfter)}</span>
                  </p>
                )}

                {quote.warnings.map((w) => (
                  <Alert key={w} tone="info">
                    {t(w)}
                  </Alert>
                ))}

                {quote.requiresOtp && (
                  <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-50 text-accent-700">
                        <MessageSquareText className="h-[18px] w-[18px]" aria-hidden />
                      </span>
                      <div className="text-sm">
                        <p className="font-semibold text-slate-900">{quote.otpTarget === "CUSTOMER" ? t("Customer approval") : t("One-time code required")}</p>
                        <p className="text-slate-500">{quote.otpReason ? t(quote.otpReason) : null}</p>
                      </div>
                    </div>
                    {challenge ? (
                      <>
                        <CodeInput length={6} value={otp} onChange={setOtp} label={t("One-time code")} invalid={error?.code === "INVALID_OTP"} />
                        <DevCodeHint code={challenge.devCode} />
                        <ResendButton challenge={challenge} onResend={sendOtp} disabled={busy} />
                      </>
                    ) : (
                      <Button variant="soft" onClick={sendOtp} loading={busy}>
                        {quote.otpTarget === "CUSTOMER" ? t("Send code to customer") : t("Send code to {destination}", { destination: quote.otpDestination ?? t("my phone") })}
                      </Button>
                    )}
                  </div>
                )}

                <div className="space-y-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <KeyRound className="h-4 w-4 text-slate-400" aria-hidden /> {pinLabel ?? t("Enter your 5-digit PIN")}
                  </p>
                  <CodeInput length={5} value={pin} onChange={setPin} secret autoFocus={!quote.requiresOtp} label={t("PIN")} invalid={error?.code === "INVALID_PIN"} />
                </div>

                {error && (
                  <Alert tone={error.code === "PIN_LOCKED" ? "warning" : "danger"}>{error.message}</Alert>
                )}

                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  <Button variant="outline" onClick={() => { setStep("form"); setError(null); }} disabled={busy}>
                    <ArrowLeft className="h-4 w-4" aria-hidden /> {t("Back")}
                  </Button>
                  <Button className="flex-1" size="lg" onClick={confirm} loading={busy} disabled={pin.length !== 5 || !otpReady}>
                    {label}
                  </Button>
                </div>
              </CardBody>
            )}

            {step === "done" && result && (
              <CardBody className="animate-fade-in">
                <Receipt result={result} />
                <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                  <Button variant="outline" className="sm:flex-1" onClick={() => setShowReceipt(true)}>
                    {t("View receipt")}
                  </Button>
                  <Button variant="outline" className="sm:flex-1" onClick={restart}>
                    {t("New transaction")}
                  </Button>
                  <Button className="sm:flex-1" onClick={() => (onDone ? onDone() : router.push(doneHref))}>
                    {t("Done")}
                  </Button>
                </div>
                <TransactionDetail transaction={result.transaction} open={showReceipt} onClose={() => setShowReceipt(false)} />
              </CardBody>
            )}
          </>
        )}
      </Card>
      {aside && <aside className="space-y-4">{aside}</aside>}
    </div>
  );
}

function Receipt({ result }: { result: OperationResult }) {
  const { t, lang } = useI18n();
  const txn = result.transaction;
  const failed = txn.status === "FAILED";
  const pending = txn.status === "PENDING";
  const type = t(TXN_META[txn.type].label);
  return (
    <div className="flex flex-col items-center text-center">
      <span
        className={cn(
          "grid h-16 w-16 animate-pop place-items-center rounded-full",
          failed ? "bg-rose-100 text-rose-600" : pending ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600",
        )}
      >
        {failed ? <CircleX className="h-9 w-9" aria-hidden /> : pending ? <Clock3 className="h-9 w-9" aria-hidden /> : <CircleCheck className="h-9 w-9" aria-hidden />}
      </span>
      <h2 className="mt-4 text-lg font-bold text-slate-900">
        {failed ? t("{type} failed", { type }) : pending ? t("{type} submitted", { type }) : t("{type} successful", { type })}
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        {failed ? t("No money was deducted from your account.") : pending ? t("It's being processed — you'll get a notification when it completes.") : formatDateTime(txn.createdAt, lang)}
      </p>
      <p className="mt-4 text-4xl font-bold tracking-tight text-slate-900">{formatMoney(txn.amount)}</p>
      <p className="mt-1 text-sm text-slate-500">
        {txn.direction === "OUT" ? t("to") : t("from")} <span className="font-medium text-slate-700">{t(txn.counterparty.name)}</span> · <span className="tabular">{txn.counterparty.account}</span>
      </p>
      <div className="mt-6 w-full max-w-sm rounded-2xl bg-slate-50 px-4">
        <DescriptionList
          items={[
            {
              label: t("Transaction ID"),
              value: (
                <button
                  type="button"
                  className="tabular inline-flex items-center gap-1.5 font-mono hover:text-accent-700"
                  onClick={() => {
                    void navigator.clipboard?.writeText(txn.trxId);
                    toast.success(t("Transaction ID copied"));
                  }}
                >
                  {txn.trxId} <Copy className="h-3.5 w-3.5" aria-hidden />
                </button>
              ),
            },
            { label: t("Fee"), value: txn.fee ? formatMoney(txn.fee) : t("Free") },
            ...(txn.commission ? [{ label: t("Commission earned"), value: formatMoney(txn.commission) }] : []),
            { label: t("Available balance"), value: formatMoney(result.balanceAfter) },
          ]}
        />
      </div>
    </div>
  );
}

function ResendButton({ challenge, onResend, disabled }: { challenge: OtpChallenge; onResend: () => void; disabled?: boolean }) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const wait = Math.max(0, Math.ceil((Date.parse(challenge.resendAvailableAt) - now) / 1000));
  return (
    <p className="text-xs text-slate-500">
      {t("Sent to")} <span className="tabular font-medium text-slate-700">{challenge.destinationMasked}</span>.{" "}
      {wait > 0 ? (
        <span>{t("Resend in {n}s", { n: wait })}</span>
      ) : (
        <button type="button" className="font-semibold text-accent-700 hover:underline disabled:opacity-50" onClick={onResend} disabled={disabled}>
          {t("Resend code")}
        </button>
      )}
    </p>
  );
}

export { ResendButton };
