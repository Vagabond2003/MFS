"use client";

import { useEffect, useRef, useState } from "react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import {
  CircleCheck,
  Clock3,
  Copy,
  Download,
  FlaskConical,
  LockKeyhole,
  Printer,
  QrCode,
  ScanLine,
  Timer,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { DescriptionList } from "@/components/ui/data";
import { Alert, EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { AmountInput, Field, Input } from "@/components/ui/form";
import { invalidateLedger, useApi } from "@/hooks/use-api";
import { useCurrentUser } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { msg } from "@/lib/i18n/core";
import { api } from "@/services";
import { toApiError } from "@/services/errors";
import { cn, formatDateTime, formatMoney, formatTime, toMinor } from "@/lib/utils";
import { takaAmountSchema } from "@/lib/validation";
import type { PaymentRequestView } from "@/types/domain";
import { CATEGORY_META } from "../register/merchant-form";
import { QuickAmounts } from "../shared/flow-aside";

function NotVerified() {
  const { t } = useI18n();
  return (
    <Card>
      <EmptyState
        icon={<LockKeyhole className="h-6 w-6" />}
        title={t("Available after verification")}
        description={t("QR codes and payment requests are enabled once your business is verified. Customers can't pay an unverified merchant.")}
        action={<ButtonLink href="/dashboard/merchant/business" variant="outline">{t("View verification status")}</ButtonLink>}
      />
    </Card>
  );
}

/* ───────────── Static QR ───────────── */

export function MerchantQrView() {
  const { t } = useI18n();
  const user = useCurrentUser();
  const qr = useApi(() => api.merchant.qr(), []);
  const canvasRef = useRef<HTMLDivElement>(null);
  const q = qr.data;

  if (qr.error) return <ErrorState message={qr.error.message} onRetry={qr.reload} />;

  const download = () => {
    const canvas = canvasRef.current?.querySelector("canvas");
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${q?.merchantId ?? "merchant"}-qr.png`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t("QR code")} description={t("Print it at your counter. Customers scan it, enter the amount and pay with their PIN.")} eyebrow={t("Payments")} />
      {user.status !== "VERIFIED" ? (
        <NotVerified />
      ) : !q ? (
        <Skeleton className="h-[520px] rounded-3xl" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
          <div className="print-area mx-auto w-full max-w-[420px] overflow-hidden rounded-3xl bg-white shadow-float ring-1 ring-slate-200">
            <div className="bg-accent-600 px-6 py-5 text-center text-accent-fg">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-80">{t("Pay with Kosh")}</p>
              <p className="mt-1 text-xl font-bold">{q.businessName}</p>
              <p className="text-xs opacity-80">{t(CATEGORY_META[q.category].label)}</p>
            </div>
            <div className="flex flex-col items-center px-6 py-7">
              <div className="rounded-2xl border border-slate-200 p-4">
                <QRCodeSVG value={q.qrPayload} size={232} level="M" marginSize={0} />
              </div>
              <p className="mt-4 text-xs font-medium uppercase tracking-wider text-slate-400">{t("Merchant ID")}</p>
              <p className="tabular font-mono text-2xl font-bold tracking-wider text-slate-900">{q.merchantId}</p>
              <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
                <ScanLine className="h-3.5 w-3.5" aria-hidden /> {t("Scan · enter amount · confirm with PIN")}
              </p>
            </div>
          </div>
          <div className="space-y-4">
            <Card>
              <CardHeader title={t("Use your QR")} />
              <CardBody className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button onClick={download}>
                    <Download className="h-4 w-4" aria-hidden /> {t("Download PNG")}
                  </Button>
                  <Button variant="outline" onClick={() => window.print()}>
                    <Printer className="h-4 w-4" aria-hidden /> {t("Print")}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      void navigator.clipboard?.writeText(q.qrPayload);
                      toast.success(t("QR content copied"));
                    }}
                  >
                    <Copy className="h-4 w-4" aria-hidden /> {t("Copy QR content")}
                  </Button>
                </div>
                <p className="text-sm text-slate-500">
                  {t("This is your static QR — the customer types the amount. For a fixed amount (e.g. a bill total), create a dynamic QR from")}{" "}
                  <a href="/dashboard/merchant/receive" className="font-semibold text-accent-700 hover:underline">
                    {t("Receive payment")}
                  </a>
                  .
                </p>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{t("Encoded content")}</p>
                  <p className="mt-1 break-all font-mono text-xs text-slate-700">{q.qrPayload}</p>
                </div>
              </CardBody>
            </Card>
            <div ref={canvasRef} className="hidden" aria-hidden>
              <QRCodeCanvas value={q.qrPayload} size={1024} level="M" marginSize={4} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────── Dynamic QR: receive a specific amount ───────────── */

function Countdown({ until }: { until: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const s = Math.max(0, Math.floor((Date.parse(until) - now) / 1000));
  return (
    <span className="tabular">
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

const REQUEST_STATUS: Record<PaymentRequestView["status"], { tone: "warning" | "success" | "neutral" | "danger"; label: string }> = {
  AWAITING: { tone: "warning", label: msg("Awaiting payment") },
  PAID: { tone: "success", label: msg("Paid") },
  EXPIRED: { tone: "neutral", label: msg("Expired") },
  CANCELLED: { tone: "danger", label: msg("Cancelled") },
};

export function ReceivePaymentView() {
  const { t, lang } = useI18n();
  const user = useCurrentUser();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [active, setActive] = useState<PaymentRequestView | null>(null);
  const [simulating, setSimulating] = useState(false);
  const history = useApi(() => api.merchant.listPaymentRequests(), [], { tags: ["payment-requests"], enabled: user.status === "VERIFIED" });

  // Poll the open request until it's paid/expired.
  const activeId = active?.id;
  const activeAwaiting = active?.status === "AWAITING";
  useEffect(() => {
    if (!activeId || !activeAwaiting) return;
    const id = window.setInterval(async () => {
      try {
        const next = await api.merchant.getPaymentRequest(activeId);
        setActive(next);
        if (next.status === "PAID") {
          toast.success(t("Payment received: {amount}", { amount: formatMoney(next.amount) }));
          invalidateLedger();
        }
      } catch {
        /* keep polling */
      }
    }, 2500);
    return () => window.clearInterval(id);
  }, [activeId, activeAwaiting, t]);

  if (user.status !== "VERIFIED") {
    return (
      <div className="space-y-6">
        <PageHeader title={t("Receive payment")} eyebrow={t("Payments")} />
        <NotVerified />
      </div>
    );
  }

  const create = async () => {
    const a = takaAmountSchema(1, 50_000).safeParse(amount);
    if (!a.success) return setError(a.error.issues[0].message);
    setError(null);
    setCreating(true);
    try {
      setActive(await api.merchant.createPaymentRequest({ amount: toMinor(a.data), note: note || undefined }));
      history.reload();
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t("Receive payment")} eyebrow={t("Payments")} description={t("Create a one-time QR for an exact amount. It confirms here the moment the customer pays.")} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Card>
          <CardHeader title={t("New payment request")} icon={<QrCode className="h-[18px] w-[18px]" />} />
          <CardBody className="space-y-5">
            <Field label={t("Amount")} required>
              {(p) => <AmountInput {...p} value={amount} onChange={(e) => setAmount(e.target.value)} disabled={activeAwaiting} />}
            </Field>
            <QuickAmounts values={[250, 500, 1000, 2500]} onPick={(v) => setAmount(String(v))} />
            <Field label={t("Note for customer")} optional>
              {(p) => <Input {...p} value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} placeholder={t("e.g. Table 6 — dinner")} disabled={activeAwaiting} />}
            </Field>
            {error && <Alert tone="danger">{t(error)}</Alert>}
            <Button size="lg" fullWidth onClick={create} loading={creating} disabled={activeAwaiting}>
              {t("Generate QR")}
            </Button>
          </CardBody>
        </Card>

        <Card className="overflow-hidden">
          {!active ? (
            <EmptyState icon={<ScanLine className="h-6 w-6" />} title={t("No active request")} description={t("Enter an amount and generate a QR. Show it to the customer to scan with their Kosh app.")} className="py-20" />
          ) : active.status === "PAID" ? (
            <div className="flex animate-fade-in flex-col items-center px-6 py-10 text-center">
              <span className="grid h-16 w-16 animate-pop place-items-center rounded-full bg-emerald-100 text-emerald-600">
                <CircleCheck className="h-9 w-9" aria-hidden />
              </span>
              <h2 className="mt-4 text-lg font-bold text-slate-900">{t("Payment confirmed")}</h2>
              <p className="mt-1 text-4xl font-bold tracking-tight text-slate-900">{formatMoney(active.amount)}</p>
              <div className="mt-6 w-full max-w-sm rounded-2xl bg-slate-50 px-4 text-left">
                <DescriptionList
                  items={[
                    { label: t("From"), value: active.payer ? `${active.payer.name} · ${active.payer.account}` : "—" },
                    { label: t("Transaction ID"), value: <span className="tabular font-mono">{active.trxId}</span> },
                    { label: t("Paid at"), value: active.paidAt ? formatDateTime(active.paidAt, lang) : "—" },
                    { label: t("Request"), value: active.id },
                  ]}
                />
              </div>
              <Button className="mt-6" onClick={() => { setActive(null); setAmount(""); setNote(""); }}>
                {t("New payment request")}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center px-6 py-8 text-center">
              <Badge tone={REQUEST_STATUS[active.status].tone} icon={active.status === "AWAITING" ? <Clock3 className="h-3.5 w-3.5" aria-hidden /> : undefined}>
                {t(REQUEST_STATUS[active.status].label)}
              </Badge>
              <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{formatMoney(active.amount)}</p>
              <p className="text-sm text-slate-500">{user.businessName}{active.note ? ` · ${active.note}` : ""}</p>
              <div className={cn("relative mt-5 rounded-2xl border border-slate-200 p-4", active.status !== "AWAITING" && "opacity-30")}>
                <QRCodeSVG value={active.qrPayload} size={220} level="M" marginSize={0} />
                {active.status === "AWAITING" && <span className="pointer-events-none absolute inset-x-4 top-4 h-0.5 animate-scan bg-accent-500/70" aria-hidden />}
              </div>
              {active.status === "AWAITING" ? (
                <>
                  <p className="mt-4 flex items-center gap-1.5 text-sm text-slate-500">
                    <Timer className="h-4 w-4" aria-hidden /> {t("Expires in")} <Countdown until={active.expiresAt} /> · {t("waiting for the customer…")}
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        setActive(await api.merchant.cancelPaymentRequest(active.id));
                        history.reload();
                      }}
                    >
                      <X className="h-4 w-4" aria-hidden /> {t("Cancel request")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void navigator.clipboard?.writeText(active.qrPayload);
                        toast.success(t("QR content copied — paste it in a customer's Merchant Pay screen"));
                      }}
                    >
                      <Copy className="h-4 w-4" aria-hidden /> {t("Copy QR content")}
                    </Button>
                  </div>
                  {api.mode !== "http" && (
                    <div className="mt-6 w-full rounded-2xl border border-dashed border-amber-300 bg-amber-50/70 p-4 text-left">
                      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-900">
                        <FlaskConical className="h-3.5 w-3.5" aria-hidden /> {t("Development QR provider")}
                      </p>
                      <p className="mt-1 text-[13px] text-amber-900">{t("Simulate a customer scanning this code and paying. A real deployment receives this from the payment network.")}</p>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="mt-3"
                        loading={simulating}
                        onClick={async () => {
                          setSimulating(true);
                          try {
                            await api.merchant.simulateQrPayment(active.id);
                          } catch (e) {
                            toast.error(toApiError(e).message);
                          } finally {
                            setSimulating(false);
                          }
                        }}
                      >
                        {t("Simulate customer payment")}
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <Button className="mt-5" onClick={() => setActive(null)}>
                  {t("New payment request")}
                </Button>
              )}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title={t("Today's payment requests")} description={t("Payment confirmations for dynamic QR codes")} />
        <div className="mt-4">
          {history.data?.length ? (
            <ul className="divide-y divide-slate-100">
              {history.data.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-500">
                    <QrCode className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">
                      {formatMoney(r.amount)} <span className="font-normal text-slate-500">· {r.note ?? r.id}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatTime(r.createdAt, lang)}
                      {r.trxId && <> · {t("TrxID")} <span className="tabular font-mono">{r.trxId}</span></>}
                      {r.payer && <> · {r.payer.name}</>}
                    </p>
                  </div>
                  <Badge tone={REQUEST_STATUS[r.status].tone}>{t(REQUEST_STATUS[r.status].label)}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={t("No requests today")} description={t("Requests you create appear here with their payment status.")} />
          )}
        </div>
      </Card>
    </div>
  );
}
