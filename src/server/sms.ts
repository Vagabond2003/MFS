/**
 * SMS over sms.net.bd (Alpha SMS). Server-only: the API key comes from the
 * environment and is never logged or sent to the browser.
 *
 * Handlers only queue messages (RequestEnv.queueSms); the RPC layer calls
 * deliverSms() after the call has succeeded.
 */

const ENDPOINT = "https://api.sms.net.bd/sendsms";

export function smsConfigured(): boolean {
  return !!process.env.SMS_NET_BD_API_KEY;
}

/** sms.net.bd error codes worth a readable log line. */
const ERRORS: Record<number, string> = {
  400: "missing or invalid parameter",
  403: "no permission",
  405: "authorization required",
  410: "account expired",
  413: "invalid sender ID",
  415: "message too long",
  416: "no valid number",
  417: "insufficient balance",
  420: "content blocked",
  421: "until the first recharge, SMS can only go to the account's registered number",
};

/** 01XXXXXXXXX → 8801XXXXXXXXX */
export function toInternational(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("880") ? digits : `88${digits}`;
}

export async function deliverSms(messages: { to: string; message: string }[]) {
  if (!smsConfigured()) return;
  for (const m of messages) {
    const body = new URLSearchParams({ api_key: process.env.SMS_NET_BD_API_KEY!, msg: m.message, to: toInternational(m.to) });
    if (process.env.SMS_SENDER_ID) body.set("sender_id", process.env.SMS_SENDER_ID);
    try {
      const res = await fetch(ENDPOINT, { method: "POST", body, signal: AbortSignal.timeout(10_000) });
      const json = (await res.json().catch(() => null)) as { error?: number; msg?: string } | null;
      if (!res.ok || !json || json.error !== 0) {
        const code = json?.error ?? res.status;
        // Log the failure, never the number, the code or the key.
        console.warn(`[sms] not sent: ${code} ${ERRORS[code] ?? json?.msg ?? ""}`.trim());
      }
    } catch (e) {
      console.warn("[sms] not sent:", e instanceof Error ? e.message.slice(0, 120) : e);
    }
  }
}
