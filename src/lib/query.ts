"use client"

import { QueryClient, useMutation, useQueryClient, type UseMutationOptions } from "@tanstack/react-query"
import { toast } from "sonner"

import { errorMessage, isApiError } from "@/lib/errors"

let browserClient: QueryClient | undefined

export function getQueryClient(): QueryClient {
  const make = () =>
    new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 15_000,
          refetchOnWindowFocus: false,
          retry: (count, error) => !isApiError(error) && count < 1,
        },
      },
    })
  if (typeof window === "undefined") return make()
  browserClient ??= make()
  return browserClient
}

interface ServiceMutationOptions<TData, TVars> extends Omit<UseMutationOptions<TData, Error, TVars>, "mutationFn"> {
  /** Success toast — string or builder. Omit for silent mutations. */
  success?: string | ((data: TData, vars: TVars) => string)
  /** Optional toast action (e.g. "Undo"). */
  successAction?: (data: TData, vars: TVars) => { label: string; onClick: () => void } | undefined
  /** Suppress the automatic error toast (when the form shows the error inline). */
  silentError?: boolean
}

/**
 * Wraps a service call: shows toasts, and on success invalidates every query so
 * all screens (counts, badges, lists) reflect the change.
 */
export function useServiceMutation<TData, TVars = void>(
  fn: (vars: TVars) => Promise<TData>,
  { success, successAction, silentError, onSuccess, onError, ...options }: ServiceMutationOptions<TData, TVars> = {}
) {
  const qc = useQueryClient()
  return useMutation<TData, Error, TVars>({
    mutationFn: fn,
    ...options,
    onSuccess: async (data, vars, ctx, mctx) => {
      await qc.invalidateQueries()
      if (success) {
        const message = typeof success === "function" ? success(data, vars) : success
        const action = successAction?.(data, vars)
        toast.success(message, action ? { action } : undefined)
      }
      await onSuccess?.(data, vars, ctx, mctx)
    },
    onError: (error, vars, ctx, mctx) => {
      if (!silentError) toast.error(errorMessage(error))
      onError?.(error, vars, ctx, mctx)
    },
  })
}
