/**
 * Turns any failed API call into the app's `ApiError`, so screens show the same
 * messages for mock and real data. Handles every error body the API produces:
 *
 * - `{ "error": "..." }` (collection default)
 * - `{ "error": "MedicationError", "kind": "already_recorded", "message": "..." }`
 * - `{ "error": "validation-error", "message": "...", "field": "platform" }`
 * - ASP.NET ProblemDetails `{ title, status, errors: { Name: ["..."] } }` (live API validation)
 */
import { AxiosError } from "axios"

import { ApiError, type ApiErrorCode } from "@/lib/errors"

interface ErrorBody {
  error?: unknown
  message?: unknown
  kind?: unknown
  field?: unknown
  title?: unknown
  errors?: Record<string, unknown>
}

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null)

function codeFor(status: number): ApiErrorCode {
  if (status === 400 || status === 422) return "VALIDATION"
  if (status === 401) return "UNAUTHENTICATED"
  if (status === 403) return "FORBIDDEN"
  if (status === 404) return "NOT_FOUND"
  if (status === 409) return "CONFLICT"
  return "SERVER"
}

const FALLBACK: Record<ApiErrorCode, string> = {
  VALIDATION: "Some of the details are not valid.",
  UNAUTHENTICATED: "Your session has ended. Please sign in again.",
  FORBIDDEN: "You don’t have access to this record.",
  NOT_FOUND: "This record doesn’t exist.",
  CONFLICT: "This change conflicts with the current data.",
  SERVER: "The server couldn’t complete the request.",
  NETWORK: "Can’t reach the server. Check your connection and try again.",
}

/** "Name" / "SystemFindings[0].System" → "name" / "systemFindings". */
function fieldName(key: string): string {
  const base = key.replace(/^\$\./, "").split(/[.[]/)[0]
  return base.charAt(0).toLowerCase() + base.slice(1)
}

export function toApiError(err: unknown, context?: string): ApiError {
  if (err instanceof ApiError) return err
  if (!(err instanceof AxiosError)) {
    return new ApiError("SERVER", err instanceof Error ? err.message : FALLBACK.SERVER)
  }
  if (!err.response) {
    return new ApiError("NETWORK", FALLBACK.NETWORK, undefined, 0)
  }
  const status = err.response.status
  const code = codeFor(status)
  const body = (typeof err.response.data === "object" && err.response.data !== null ? err.response.data : {}) as ErrorBody

  let message: string | null = null
  let field: string | undefined
  if (body.errors && typeof body.errors === "object") {
    const [key, value] = Object.entries(body.errors)[0] ?? []
    const first = Array.isArray(value) ? text(value[0]) : text(value)
    if (key && first) {
      message = first
      field = fieldName(key)
    }
  }
  // `message` wins when `error` is only a machine code ("MedicationError", "validation-error").
  message ??= text(body.message) ?? text(body.error) ?? text(body.title)
  field ??= text(body.field) ?? undefined
  if (!message) {
    message = status >= 500 ? `${FALLBACK.SERVER} (HTTP ${status})` : FALLBACK[code]
    if (status === 404 && context) message = `${context} is not available from the API (HTTP 404).`
  }
  return new ApiError(code, message, field, status)
}
