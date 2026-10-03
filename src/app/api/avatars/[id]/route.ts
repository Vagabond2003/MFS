import type { NextRequest } from "next/server";
import { SESSION_COOKIE, getApiMode, readSessionClaims } from "@/lib/auth/session-token";
import { readAvatar, sessionActive } from "@/server/db-store";

export const runtime = "nodejs";

/**
 * GET /api/avatars/:id — a profile picture, for signed-in users only.
 * Ids are random and change with every new picture, so responses are cached
 * privately for a long time.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (getApiMode() !== "supabase") return new Response(null, { status: 404 });
  const claims = await readSessionClaims(request.cookies.get(SESSION_COOKIE)?.value);
  if (!claims || !(await sessionActive(claims.sid))) return new Response(null, { status: 401, headers: { "Cache-Control": "no-store" } });

  const { id } = await ctx.params;
  if (!/^avt_[A-Za-z0-9]{6,40}$/.test(id)) return new Response(null, { status: 404 });
  const avatar = await readAvatar(id).catch(() => null);
  if (!avatar) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

  const etag = `"${avatar.sha256}"`;
  const headers = {
    "Content-Type": avatar.mimeType,
    "Cache-Control": "private, max-age=31536000, immutable",
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(new Uint8Array(avatar.data), { headers });
}
