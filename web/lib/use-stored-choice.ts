"use client"

import { useCallback, useSyncExternalStore } from "react"

const listeners = new Set<() => void>()

function subscribe(fn: () => void) {
  listeners.add(fn)
  window.addEventListener("storage", fn)
  return () => {
    listeners.delete(fn)
    window.removeEventListener("storage", fn)
  }
}

/**
 * A small UI preference kept in localStorage (e.g. list vs week view).
 * Server render and first paint use `fallback`, so hydration matches.
 */
export function useStoredChoice<T extends string>(key: string, options: readonly T[], fallback: T): [T, (v: T) => void] {
  const read = () => {
    try {
      const v = window.localStorage.getItem(key)
      return v && (options as readonly string[]).includes(v) ? (v as T) : fallback
    } catch {
      return fallback
    }
  }
  const value = useSyncExternalStore(subscribe, read, () => fallback)
  const set = useCallback(
    (v: T) => {
      try {
        window.localStorage.setItem(key, v)
      } catch {
        /* private mode: keep it for this page only */
      }
      listeners.forEach((fn) => fn())
    },
    [key]
  )
  return [value, set]
}
