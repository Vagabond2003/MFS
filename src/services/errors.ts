export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_SUSPENDED"
  | "ACCOUNT_NOT_VERIFIED"
  | "INSUFFICIENT_FUNDS"
  | "LIMIT_EXCEEDED"
  | "INVALID_PIN"
  | "PIN_LOCKED"
  | "OTP_REQUIRED"
  | "INVALID_OTP"
  | "OTP_EXPIRED"
  | "RATE_LIMITED"
  | "CONFLICT"
  | "NOT_SUPPORTED"
  | "NETWORK"
  | "UNKNOWN";

const STATUS: Record<ApiErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_SUSPENDED: 403,
  ACCOUNT_NOT_VERIFIED: 403,
  INSUFFICIENT_FUNDS: 422,
  LIMIT_EXCEEDED: 422,
  INVALID_PIN: 401,
  PIN_LOCKED: 423,
  OTP_REQUIRED: 428,
  INVALID_OTP: 401,
  OTP_EXPIRED: 410,
  RATE_LIMITED: 429,
  CONFLICT: 409,
  NOT_SUPPORTED: 501,
  NETWORK: 0,
  UNKNOWN: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly fieldErrors?: Record<string, string>;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ApiErrorCode,
    message: string,
    extra: { fieldErrors?: Record<string, string>; details?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = STATUS[code];
    this.fieldErrors = extra.fieldErrors;
    this.details = extra.details;
  }
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof Error) return new ApiError("UNKNOWN", err.message || "Something went wrong");
  return new ApiError("UNKNOWN", "Something went wrong");
}

export function errorMessage(err: unknown) {
  return toApiError(err).message;
}
