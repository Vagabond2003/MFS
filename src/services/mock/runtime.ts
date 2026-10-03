import type { SessionClaims } from "@/lib/auth/session-token";
import type { Lang } from "@/lib/i18n/core";

/**
 * What the API handlers can read from the current request. The RPC route
 * (src/server/rpc.ts) installs a provider that exposes the already-verified
 * JWT claims and request headers, and collects the session cookie to set as
 * httpOnly on the response.
 */
export interface RequestEnv {
  /** Verified session claims from the request, or null when signed out. */
  claims(): SessionClaims | null;
  setSession(claims: SessionClaims, remember: boolean): void;
  clearSession(): void;
  userAgent(): string;
  ip(): string;
  /** Interface language of the request (language cookie). */
  lang(): Lang;
}

// Kept on globalThis: dev-server hot reload can re-run this module without
// re-running src/server/rpc.ts, which would otherwise leave no provider.
const g = globalThis as unknown as { __koshRequestEnv?: () => RequestEnv | undefined };

export function setRequestEnvProvider(next: () => RequestEnv | undefined) {
  g.__koshRequestEnv = next;
}

export function requestEnv(): RequestEnv {
  const env = g.__koshRequestEnv?.();
  if (!env) throw new Error("API handlers must run inside a server request (src/server/rpc.ts).");
  return env;
}
