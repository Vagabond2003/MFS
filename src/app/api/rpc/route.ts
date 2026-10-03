import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, getApiMode, readSessionClaims, signSessionToken } from "@/lib/auth/session-token";
import { resolveMethod, runCall, type CallContext } from "@/server/rpc";
import type { UploadPurpose } from "@/services/contracts";
import { DEFAULT_LANG, LANG_COOKIE, isLang, translator } from "@/lib/i18n/core";

export const runtime = "nodejs";

const UPLOAD_PURPOSES: string[] = ["NID", "PHOTO", "SELFIE", "BUSINESS_DOCUMENT", "AVATAR"] satisfies UploadPurpose[];

/**
 * Single API endpoint for NEXT_PUBLIC_API_MODE=supabase.
 *   JSON:      { group, method, args }  →  { data } | { error }
 *   multipart: uploads.upload(file, purpose)
 */
export async function POST(request: NextRequest) {
  if (getApiMode() !== "supabase") {
    return NextResponse.json({ error: { code: "NOT_SUPPORTED", message: "Server API is disabled in this mode." } }, { status: 404 });
  }

  // Same-origin only (the session cookie is SameSite=Lax as a second layer).
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Cross-site request blocked." } }, { status: 403 });
  }

  let group: unknown;
  let method: unknown;
  let args: unknown[];
  try {
    if ((request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      const purpose = form.get("purpose");
      if (!(file instanceof File) || typeof purpose !== "string" || !UPLOAD_PURPOSES.includes(purpose)) {
        return NextResponse.json({ error: { code: "VALIDATION", message: "Choose a file to upload." } }, { status: 422 });
      }
      group = "uploads";
      method = "upload";
      args = [file, purpose];
    } else {
      const body = (await request.json()) as { group?: unknown; method?: unknown; args?: unknown };
      group = body.group;
      method = body.method;
      args = Array.isArray(body.args) ? body.args : [];
    }
  } catch {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Malformed request." } }, { status: 400 });
  }

  const fn = resolveMethod(group, method);
  if (!fn) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Unknown API method." } }, { status: 404 });
  }

  const langCookie = request.cookies.get(LANG_COOKIE)?.value;
  const lang = isLang(langCookie) ? langCookie : DEFAULT_LANG;
  const ctx: CallContext = {
    claims: await readSessionClaims(request.cookies.get(SESSION_COOKIE)?.value),
    userAgent: request.headers.get("user-agent") ?? "",
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "127.0.0.1",
    lang,
    cookie: null,
  };

  const result = await runCall(ctx, fn, args);
  // Error text goes back in the caller's interface language.
  const t = translator(lang);
  const res = result.ok
    ? NextResponse.json({ data: result.data ?? null })
    : NextResponse.json(
        {
          error: {
            code: result.error.code,
            message: t(result.error.message),
            fieldErrors: result.error.fieldErrors
              ? Object.fromEntries(Object.entries(result.error.fieldErrors).map(([k, v]) => [k, t(v)]))
              : undefined,
            details: result.error.details,
          },
        },
        { status: result.error.status || 500 },
      );
  res.headers.set("Cache-Control", "no-store");

  if (ctx.cookie?.action === "set") {
    const { claims, remember } = ctx.cookie;
    res.cookies.set(SESSION_COOKIE, await signSessionToken(claims), {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      ...(remember ? { maxAge: Math.max(0, claims.exp - Math.floor(Date.now() / 1000)) } : {}),
    });
  } else if (ctx.cookie?.action === "clear") {
    res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  }
  return res;
}
