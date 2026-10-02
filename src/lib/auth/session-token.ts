import { ROLES, type Role } from "@/types/domain";

/**
 * Session token handling for the route guard (src/proxy.ts).
 *
 * PRODUCTION (`NEXT_PUBLIC_API_MODE=http`)
 *   The backend sets an httpOnly, Secure, SameSite=Lax cookie containing a
 *   signed JWT `{ sid, role, exp }`. The proxy verifies the signature with
 *   AUTH_JWT_SECRET (HS256) before trusting the role claim. The backend still
 *   re-checks the session and role on every API call.
 *
 * DEVELOPMENT (`NEXT_PUBLIC_API_MODE=mock`, the default)
 *   The in-browser mock API cannot set httpOnly cookies or hold a secret, so
 *   it writes an UNSIGNED token prefixed with `mock.`. The proxy accepts it
 *   only in mock mode. Tampering with it changes nothing important: the mock
 *   API resolves the real role from its session table, and the client guard
 *   redirects on any mismatch.
 */

export const SESSION_COOKIE = "kosh_session";

export interface SessionClaims {
  sid: string;
  role: Role;
  /** Expiry, epoch seconds */
  exp: number;
}

function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

function base64UrlEncode(text: string) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string) {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeMockToken(claims: SessionClaims) {
  return `mock.${base64UrlEncode(JSON.stringify(claims))}`;
}

export function decodeMockToken(token: string): SessionClaims | null {
  if (!token.startsWith("mock.")) return null;
  try {
    const parsed = JSON.parse(base64UrlDecode(token.slice(5)));
    if (typeof parsed?.sid !== "string" || !isRole(parsed.role) || typeof parsed.exp !== "number") {
      return null;
    }
    return parsed as SessionClaims;
  } catch {
    return null;
  }
}

export type ApiMode = "mock" | "http";

export function getApiMode(): ApiMode {
  return process.env.NEXT_PUBLIC_API_MODE === "http" ? "http" : "mock";
}

/** Server-side (proxy) verification of the session cookie. */
export async function readSessionClaims(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  const nowSec = Math.floor(Date.now() / 1000);

  if (getApiMode() === "mock") {
    const claims = decodeMockToken(token);
    return claims && claims.exp > nowSec ? claims : null;
  }

  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret) return null; // fail closed
  try {
    const { jwtVerify } = await import("jose");
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
    });
    if (typeof payload.sid !== "string" || !isRole(payload.role) || typeof payload.exp !== "number") {
      return null;
    }
    return { sid: payload.sid, role: payload.role, exp: payload.exp };
  } catch {
    return null;
  }
}
