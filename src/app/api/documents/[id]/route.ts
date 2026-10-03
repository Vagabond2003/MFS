import { NextResponse, type NextRequest } from "next/server";
import { getApiMode } from "@/lib/auth/session-token";
import { translator } from "@/lib/i18n/core";
import { readDocumentFile } from "@/server/db-store";
import { callContextFor, runCall } from "@/server/rpc";
import { authorizeDocumentView } from "@/services/mock/handlers/admin";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET /api/documents/:id — a verification document's file (NID, photo, trade
 * license …), for administrators only. Every view is audit-logged. The file
 * is sensitive, so nothing is cached and it can't run as a page.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (getApiMode() !== "supabase") return new Response(null, { status: 404 });
  // Only the app itself may open documents (a link from another site would also write an audit entry).
  if (request.headers.get("sec-fetch-site") === "cross-site") return new Response(null, { status: 403, headers: NO_STORE });

  const { id } = await ctx.params;
  if (!/^doc_[A-Za-z0-9]{6,40}$/.test(id)) return new Response(null, { status: 404, headers: NO_STORE });

  const call = await callContextFor(request);
  const t = translator(call.lang);
  const result = await runCall(call, () => authorizeDocumentView(id), []);
  if (!result.ok) {
    return NextResponse.json({ error: { code: result.error.code, message: t(result.error.message) } }, { status: result.error.status || 500, headers: NO_STORE });
  }

  const file = await readDocumentFile(id).catch(() => null);
  if (!file) {
    return NextResponse.json(
      { error: { code: "FILE_NOT_STORED", message: t("This file wasn't kept: it was uploaded before document storage was turned on. Ask the applicant to upload it again.") } },
      { status: 404, headers: NO_STORE },
    );
  }

  return new Response(new Uint8Array(file.data), {
    headers: {
      ...NO_STORE,
      "Content-Type": file.mimeType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent((result.data as { fileName: string }).fileName)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
