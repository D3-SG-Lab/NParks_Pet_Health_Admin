/**
 * Central Axios instance for the NParksPetHealth API.
 *
 * - Base URL: same-origin proxy `/backend/api/v1` (rewritten to NEXT_PUBLIC_API_BASE_URL).
 * - Request interceptor: `Authorization: Bearer <access_token>` on every call except `/auth/*`.
 * - Response interceptor: on 401, one `POST /auth/refresh` (shared by concurrent calls),
 *   then the request is retried once. Without a refresh token, or if refresh fails,
 *   the session-expired handler signs the user out.
 * - Every error is normalised to `ApiError` (see ./errors.ts).
 */
import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from "axios"

import { API_PROXY_PREFIX } from "./config"
import { ENDPOINTS } from "./api-endpoints"
import { toApiError } from "./errors"
import { clearTokens, getTokens, setTokens } from "./token-store"
import type { TokenResponse } from "./types"

export const http = axios.create({
  baseURL: API_PROXY_PREFIX,
  timeout: 30_000,
  headers: { Accept: "application/json" },
})

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean }

const isAuthCall = (url: string | undefined) => Boolean(url?.startsWith("/auth/"))

let onSessionExpired: (() => void) | null = null

/** Registered by the auth service: clears the session and sends the user to sign-in. */
export function setSessionExpiredHandler(handler: () => void): void {
  onSessionExpired = handler
}

http.interceptors.request.use((config) => {
  const tokens = getTokens()
  if (tokens && !isAuthCall(config.url)) {
    config.headers.set("Authorization", `${tokens.tokenType || "Bearer"} ${tokens.accessToken}`)
  }
  return config
})

let refreshing: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getTokens()?.refreshToken
  if (!refreshToken) return null
  try {
    const { data } = await http.post<TokenResponse>(ENDPOINTS.auth.refresh, { refresh_token: refreshToken })
    return setTokens(data).accessToken
  } catch {
    return null
  }
}

http.interceptors.response.use(
  (res) => res,
  async (error: unknown) => {
    if (error instanceof AxiosError && error.response?.status === 401 && error.config && !isAuthCall(error.config.url)) {
      const config = error.config as RetriableConfig
      if (!config._retried) {
        config._retried = true
        refreshing ??= refreshAccessToken().finally(() => {
          refreshing = null
        })
        const token = await refreshing
        if (token) {
          config.headers.set("Authorization", `Bearer ${token}`)
          return http.request(config)
        }
      }
      clearTokens()
      onSessionExpired?.()
    }
    return Promise.reject(error)
  }
)

/** Typed helpers: return the response body, throw `ApiError`. `what` names the record for 404 messages. */
export async function apiGet<T>(url: string, params?: AxiosRequestConfig["params"], what?: string): Promise<T> {
  try {
    return (await http.get<T>(url, { params })).data
  } catch (e) {
    throw toApiError(e, what)
  }
}

export async function apiPost<T, B = unknown>(url: string, body?: B, what?: string): Promise<T> {
  try {
    return (await http.post<T>(url, body)).data
  } catch (e) {
    throw toApiError(e, what)
  }
}

export async function apiPut<T, B = unknown>(url: string, body?: B, what?: string): Promise<T> {
  try {
    return (await http.put<T>(url, body)).data
  } catch (e) {
    throw toApiError(e, what)
  }
}

export async function apiPatch<T, B = unknown>(url: string, body?: B, what?: string): Promise<T> {
  try {
    return (await http.patch<T>(url, body)).data
  } catch (e) {
    throw toApiError(e, what)
  }
}

export async function apiDelete<T = void>(url: string, params?: AxiosRequestConfig["params"], what?: string): Promise<T> {
  try {
    return (await http.delete<T>(url, { params })).data
  } catch (e) {
    throw toApiError(e, what)
  }
}
