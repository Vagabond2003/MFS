import type { ApiClient } from "./contracts";
import { httpApi } from "./http";
import { mockApi } from "./mock";

/**
 * The one API client the UI uses. Select the implementation with
 * NEXT_PUBLIC_API_MODE (inlined at build time):
 *   mock (default) — in-browser development server with demo data
 *   http           — REST backend at NEXT_PUBLIC_API_BASE_URL
 */
export const api: ApiClient = process.env.NEXT_PUBLIC_API_MODE === "http" ? httpApi : mockApi;

export { ApiError, errorMessage } from "./errors";
export type { ApiClient } from "./contracts";
