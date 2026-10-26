"use client"

import { keepPreviousData, useIsRestoring, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useMemo, useSyncExternalStore } from "react"
import { projectPath, projects, useOutbox } from "@/lib/offline-queue"
import { ApiError, api } from "./client"
import type { DayResponse, Macros } from "./types"

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
  const hydrated = useHydrated()
  const query = useQuery<T, ApiError>({
    queryKey: [path],
    queryFn: ({ signal }) => api.get<T>(path as string, undefined, signal),
    enabled: path !== null,
    placeholderData: opts.keepPrevious ? keepPreviousData : undefined,
  })

  // Changes saved offline, laid on top (lib/offline-queue.ts).
  const outbox = useOutbox()
  const projected = path !== null && projects(path)
  const data = useMemo(
    () =>
      projected && path
        ? projectPath<T>(path, query.data, outbox, () => newestDayTarget(client.getQueriesData<DayResponse>({ predicate: isDayQuery })))
        : query.data,
    [projected, path, query.data, outbox, client]
  )

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

  // Hydrating server HTML: render what the server did (nothing cached yet,
  // loading). A subtree can hydrate after the device cache was restored, and
  // showing that data then wouldn't match the server's skeleton.
  if (!hydrated) return { data: undefined, error: null, loading: path !== null, reload, setData }

  return {
    data,
    error: asApiError(query.error),
    // Pending with no fetch running means the cache is still being restored
    // from the device: that's "loading" too, not "empty".
    loading: path !== null && data === undefined && query.isPending && (query.fetchStatus !== "idle" || restoring),
    reload,
    setData,
  }
}

const subscribeNever = () => () => {}

/** False while React hydrates server HTML, true after (and on client-only renders). */
function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  )
}

const isDayQuery = (q: { queryKey: readonly unknown[] }) => typeof q.queryKey[0] === "string" && /^days\/\d{4}-\d{2}-\d{2}$/.test(q.queryKey[0])

/** The target of the newest cached day (a day logged offline before it was ever loaded). */
function newestDayTarget(list: [readonly unknown[], DayResponse | undefined][]): Macros | undefined {
  let best: DayResponse | undefined
  for (const [, d] of list) if (d?.day && (!best || d.day.date > best.day.date)) best = d
  return best?.day.target
}
