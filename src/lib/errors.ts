/** Error types returned by the service layer — mirror the API's JSON error format (BE-001). */

export type ApiErrorCode =
  | "FORBIDDEN" // 403 — role or kennel scope (BE-005)
  | "NOT_FOUND" // 404
  | "CONFLICT" // 409 — invalid case transition, duplicate microchip, double dose…
  | "VALIDATION" // 422
  | "UNAUTHENTICATED" // 401

const STATUS: Record<ApiErrorCode, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION: 422,
  UNAUTHENTICATED: 401,
}

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: number
  readonly field?: string
  readonly ref: string

  constructor(code: ApiErrorCode, message: string, field?: string) {
    super(message)
    this.name = "ApiError"
    this.code = code
    this.status = STATUS[code]
    this.field = field
    this.ref = Math.random().toString(16).slice(2, 6).toUpperCase() + "-" + Math.random().toString(16).slice(2, 6).toUpperCase()
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return "Something went wrong. Please try again."
}
