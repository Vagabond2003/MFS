import type { ApiClient } from "./contracts";
import { httpApi } from "./http";
import { rpcApi } from "./rpc";

/**
 * The one API client the UI uses. Select the implementation with
 * NEXT_PUBLIC_API_MODE (inlined at build time):
 *   supabase (default) — this app's server API, data in Supabase PostgreSQL
 *   http               — external REST backend at NEXT_PUBLIC_API_BASE_URL
 */
export const api: ApiClient = process.env.NEXT_PUBLIC_API_MODE === "http" ? httpApi : rpcApi;

export { ApiError, errorMessage } from "./errors";
export type { ApiClient } from "./contracts";
