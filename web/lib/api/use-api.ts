"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ApiError, api } from "./client"

export type ApiState<T> = {
  /** Data for the current path (never a previous path's data). */
  data: T | undefined
  error: ApiError | null
  /** True until the first response (or error) for the current path. */
  loading: boolean
  /** Refetch in the background; resolves when done. */
  reload: () => Promise<void>
  /** Replace the data for the current path (e.g. with a mutation's response). */
  setData: (next: T | ((prev: T | undefined) => T)) => void
}

type Slot<T> = { path: string; data?: T; error?: ApiError }

/**
 * GET an /api/v1 path and keep it in state. Pass `null` to skip. Refetches when
 * the path changes and when the tab becomes visible again (PWA resume).
 */
export function useApi<T>(path: string | null): ApiState<T> {
  const [slot, setSlot] = useState<Slot<T> | null>(null)
  const reqId = useRef(0)

  const run = useCallback(async (p: string) => {
    const id = ++reqId.current
    try {
      const result = await api.get<T>(p)
      if (id !== reqId.current) return
      setSlot({ path: p, data: result })
    } catch (err) {
      if (id !== reqId.current) return
      if (err instanceof DOMException && err.name === "AbortError") return
      setSlot((prev) => ({
        path: p,
        // Keep showing data we already had for this path on a refetch error.
        data: prev?.path === p ? prev.data : undefined,
        error: err instanceof ApiError ? err : new ApiError(0, String(err)),
      }))
    }
  }, [])

  useEffect(() => {
    if (!path) return
    void run(path)
    const onVisible = () => {
      if (document.visibilityState === "visible") void run(path)
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [path, run])

  const reload = useCallback(async () => {
    if (path) await run(path)
  }, [path, run])

  const setData = useCallback(
    (next: T | ((prev: T | undefined) => T)) => {
      if (!path) return
      reqId.current++ // a pending fetch must not overwrite fresher local data
      setSlot((prev) => {
        const prevData = prev?.path === path ? prev.data : undefined
        const value =
          typeof next === "function" ? (next as (p: T | undefined) => T)(prevData) : next
        return { path, data: value }
      })
    },
    [path]
  )

  const current = slot && path && slot.path === path ? slot : null
  return {
    data: current?.data,
    error: current?.error ?? null,
    loading: path !== null && !current,
    reload,
    setData,
  }
}
