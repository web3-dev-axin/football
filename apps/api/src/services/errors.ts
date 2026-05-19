import type { ApiErrorBody } from "@polygoal/shared";

export class ApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400, public readonly details: Record<string, unknown> = {}) {
    super(message);
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof Error && "code" in error && typeof (error as { code?: unknown }).code === "string") {
    const code = (error as { code: string }).code;
    const status = code.includes("NOT_FOUND") ? 404 : code.includes("REVIEW_REQUIRED") || code.includes("CHALLENGED") || code.includes("WINDOW_OPEN") || code.includes("WINDOW_CLOSED") || code.includes("FINALIZED") ? 409 : 400;
    return new ApiError(code, error.message, status);
  }
  if (error instanceof Error) return new ApiError("INTERNAL_ERROR", error.message, 500);
  return new ApiError("INTERNAL_ERROR", "Unknown error", 500);
}

export function errorBody(error: ApiError): ApiErrorBody {
  return { error: { code: error.code, message: error.message, details: error.details } };
}
