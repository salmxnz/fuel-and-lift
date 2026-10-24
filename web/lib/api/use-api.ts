"use client"

import { keepPreviousData, useIsRestoring, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import { ApiError, api } from "./client"

export type ApiState<T> = {
  /** Data for the current path: cached data shows at once and refreshes in the background. */
  data: T | undefined
  error: ApiError | null
  /** True only while there's nothing to show yet for the current path. */
  loading: boolean
  /** Refetch in the background; resolves when done. */
  reload: () => Promise<void>
  /** Replace the cached data for the current path (e.g. with a mutation's response). */
  setData: (next: T | ((prev: T | undefined) => T)) => void
}

export type ApiOptions = {
  /**
   * While a new path loads, keep showing the previous path's data (week
   * strips, search results) instead of going back to a skeleton.
   */
  keepPrevious?: boolean
}

function asApiError(err: unknown): ApiError | null {
  if (!err) return null
  return err instanceof ApiError ? err : new ApiError(0, String(err))
}

/**
 * GET an /api/v1 path through the shared data cache (lib/api/query-client.ts).
 * Pass `null` to skip. Screens that used the path before show its data at
 * once; stale data refetches in the background, on focus and on reconnect.
 */
export function useApi<T>(path: string | null, opts: ApiOptions = {}): ApiState<T> {
  const client = useQueryClient()
  const restoring = useIsRestoring()
  const query = useQuery<T, ApiError>({
    queryKey: [path],
    queryFn: ({ signal }) => api.get<T>(path as string, undefined, signal),
    enabled: path !== null,
    placeholderData: opts.keepPrevious ? keepPreviousData : undefined,
  })

  const { refetch } = query
  const reload = useCallback(async () => {
    if (path) await refetch()
  }, [path, refetch])

  const setData = useCallback(
    (next: T | ((prev: T | undefined) => T)) => {
      if (!path) return
      client.setQueryData<T>([path], (prev) =>
        typeof next === "function" ? (next as (p: T | undefined) => T)(prev) : next
      )
    },
    [client, path]
  )

  return {
    data: query.data,
    error: asApiError(query.error),
    // Pending with no fetch running means the cache is still being restored
    // from the device: that's "loading" too, not "empty".
    loading: path !== null && query.isPending && (query.fetchStatus !== "idle" || restoring),
    reload,
    setData,
  }
}
