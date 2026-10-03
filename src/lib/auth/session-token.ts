import { ROLES, type Role } from "@/types/domain";

/**
 * Session token handling for the route guard (src/proxy.ts).
 *
 * The session cookie is an httpOnly, SameSite=Lax cookie holding a JWT
 * `{ sid, role, exp }` signed with AUTH_JWT_SECRET (HS256). It is set by this
 * app's /api/rpc route (or by an external backend in `http` mode). The proxy
 * verifies the signature before trusting the role claim, and the API
 * re-checks the session and role against the database on every call.
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

/**
 * supabase (default) — API runs on this Next.js server against PostgreSQL (Supabase).
 * http               — separate REST backend that signs the same JWT.
 */
export type ApiMode = "supabase" | "http";

export function getApiMode(): ApiMode {
  return process.env.NEXT_PUBLIC_API_MODE === "http" ? "http" : "supabase";
}

/** Server-only: signs the session JWT verified by readSessionClaims(). */
export async function signSessionToken(claims: SessionClaims): Promise<string> {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_JWT_SECRET must be set to a random string of at least 32 characters.");
  }
  const { SignJWT } = await import("jose");
  return new SignJWT({ sid: claims.sid, role: claims.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(claims.exp)
    .sign(new TextEncoder().encode(secret));
}

/** Server-side (proxy) verification of the session cookie. */
export async function readSessionClaims(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
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
