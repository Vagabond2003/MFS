import nodemailer, { type Transporter } from "nodemailer";
import { localizeMonths, msg, translator, type Lang } from "@/lib/i18n/core";
import { isDeliverableEmail } from "@/lib/validation";
import { SECURITY } from "@/services/mock/policy";
import type { OutgoingEmail } from "@/services/mock/runtime";
import type { OtpPurpose } from "@/types/domain";

/**
 * Email over Brevo SMTP. Server-only: credentials come from the environment
 * and are never logged or sent to the browser.
 *
 * Handlers only queue emails (RequestEnv.queueEmail); the RPC layer calls
 * deliverEmails() after the call has succeeded.
 */

export function emailConfigured(): boolean {
  return !!(process.env.BREVO_SMTP_HOST && process.env.BREVO_SMTP_USER && process.env.BREVO_SMTP_PASSWORD && process.env.EMAIL_FROM);
}

const g = globalThis as unknown as { __koshMailer?: Transporter };

function transport(): Transporter {
  return (g.__koshMailer ??= nodemailer.createTransport({
    host: process.env.BREVO_SMTP_HOST,
    port: Number(process.env.BREVO_SMTP_PORT || 587),
    secure: Number(process.env.BREVO_SMTP_PORT) === 465,
    requireTLS: Number(process.env.BREVO_SMTP_PORT) !== 465,
    auth: { user: process.env.BREVO_SMTP_USER, pass: process.env.BREVO_SMTP_PASSWORD },
    pool: true,
    maxConnections: 2,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  }));
}

export async function deliverEmails(emails: OutgoingEmail[], origin: string) {
  if (!emailConfigured()) return;
  for (const email of emails) {
    if (!isDeliverableEmail(email.to)) continue;
    const { subject, text, html } = renderEmail(email, origin);
    try {
      await transport().sendMail({ from: process.env.EMAIL_FROM, to: email.to, subject, text, html });
    } catch (e) {
      // Log the failure, never the address or the code.
      console.warn(`[email] ${email.kind} not sent:`, e instanceof Error ? e.message.slice(0, 160) : e);
    }
  }
}

/* ───────────── Templates ───────────── */

/** Subject, plain text and HTML for an email (exported for previews). */
export function renderEmail(email: OutgoingEmail, origin: string) {
  return email.kind === "OTP" ? otpEmail(email) : noticeEmail(email, origin);
}

const OTP_REASON: Record<OtpPurpose, string> = {
  REGISTRATION: msg("to finish creating your Kosh account"),
  LOGIN: msg("to sign in to Kosh"),
  PASSWORD_RESET: msg("to reset your Kosh password"),
  TRANSACTION: msg("to confirm your transaction"),
  CUSTOMER_CASH_OUT: msg("to approve a cash out at an agent"),
  CHANGE_PIN: msg("to change your transaction PIN"),
  ENABLE_2FA: msg("to turn on two-step verification"),
};

function otpEmail(e: Extract<OutgoingEmail, { kind: "OTP" }>) {
  const t = translator(e.lang);
  const minutes = Math.round(SECURITY.otpTtlSeconds / 60);
  const subject = t("Your Kosh verification code");
  const intro = t("Use this code {reason}. It expires in {minutes} minutes.", { reason: t(OTP_REASON[e.purpose]), minutes });
  const warning = t("Kosh will never ask you for this code. Don't share it with anyone — not even someone who says they work for Kosh.");
  const ignore = t("If you didn't ask for this code, you can ignore this email.");
  const text = [greeting(e.name, e.lang), "", intro, "", e.code, "", warning, ignore].join("\n");
  const html = layout(e.lang, `
    <p style="margin:0 0 16px">${esc(greeting(e.name, e.lang))}</p>
    <p style="margin:0 0 20px">${esc(intro)}</p>
    <p style="margin:0 0 20px;font-size:32px;font-weight:700;letter-spacing:8px;font-family:ui-monospace,Menlo,Consolas,monospace;color:#0f172a">${esc(e.code)}</p>
    <p style="margin:0 0 8px;color:#b45309">${esc(warning)}</p>
    <p style="margin:0;color:#64748b">${esc(ignore)}</p>`);
  return { subject, text, html };
}

function noticeEmail(e: Extract<OutgoingEmail, { kind: "NOTICE" }>, origin: string) {
  const t = translator(e.lang);
  // Stored notification text is English with values; translate() also matches the value patterns.
  const title = localizeMonths(e.lang, t(e.title));
  const body = localizeMonths(e.lang, t(e.body));
  const url = e.link ? new URL(e.link, origin).toString() : origin;
  const open = t("Open Kosh");
  const text = [greeting(e.name, e.lang), "", title, body, "", `${open}: ${url}`].join("\n");
  const html = layout(e.lang, `
    <p style="margin:0 0 16px">${esc(greeting(e.name, e.lang))}</p>
    <p style="margin:0 0 8px;font-size:17px;font-weight:700;color:#0f172a">${esc(title)}</p>
    <p style="margin:0 0 24px">${esc(body)}</p>
    <a href="${esc(url)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:10px">${esc(open)}</a>`);
  return { subject: `${title} · Kosh`, text, html };
}

function greeting(name: string | null, lang: Lang) {
  const t = translator(lang);
  return name ? t("Hello {name},", { name }) : t("Hello,");
}

function layout(lang: Lang, content: string) {
  const t = translator(lang);
  const footer = t("This is an automatic email from Kosh. Please don't reply.");
  return `<!doctype html><html lang="${lang}"><body style="margin:0;background:#f1f5f9;font-family:-apple-system,'Segoe UI',Roboto,'Noto Sans Bengali',Arial,sans-serif;color:#334155;font-size:15px;line-height:1.6">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0">
      <tr><td style="padding:20px 28px;border-bottom:1px solid #e2e8f0;font-size:20px;font-weight:800;color:#0f766e">Kosh</td></tr>
      <tr><td style="padding:28px">${content}</td></tr>
      <tr><td style="padding:16px 28px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8">${esc(footer)}</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
