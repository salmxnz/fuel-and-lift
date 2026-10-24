"use client"

import { QueryClient } from "@tanstack/react-query"
import { ApiError, api, onApiWrite } from "./client"

// The client-side data cache (TanStack Query). Queries are keyed by their API
// path (["days/2026-10-24"]) so screens share data, and the cache is saved to
// localStorage (see components/query-provider.tsx) so a cold start shows the
// last data at once and refreshes it in the background.

const HOUR = 60 * 60 * 1000

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Fresh for 30 s: switching tabs inside that window doesn't refetch.
        staleTime: 30_000,
        // Kept (and persisted) for a day.
        gcTime: 24 * HOUR,
        // Don't retry what the server answered on purpose (404, 403…).
        retry: (count, err) => count < 1 && (!(err instanceof ApiError) || err.status === 0 || err.status >= 500),
        // Coming back to the app refetches stale queries only.
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        queryFn: ({ queryKey, signal }) => api.get(queryKey[0] as string, undefined, signal),
      },
    },
  })
}

let browserClient: QueryClient | undefined

/** One client per browser tab; a fresh one per server render. */
export function getQueryClient(): QueryClient {
  if (typeof window === "undefined") return makeQueryClient()
  if (!browserClient) {
    browserClient = makeQueryClient()
    onApiWrite((path) => invalidate(affectedBy(path)))
  }
  return browserClient
}

/** Mark every query whose path starts with one of prefixes stale (active ones refetch). */
export function invalidate(prefixes: string[]) {
  if (!browserClient || prefixes.length === 0) return
  void browserClient.invalidateQueries({
    predicate: (q) => {
      const key = q.queryKey[0]
      return typeof key === "string" && prefixes.some((p) => key.startsWith(p))
    },
  })
}

const GYM = ["templates", "routines", "weekly-plan", "sessions", "progress/", "exercises", "shop", "people/", "friends/week"]

/** Which cached paths a write to path can change. */
export function affectedBy(path: string): string[] {
  const p = path.replace(/^\/+/, "")
  const first = p.split("/")[0]
  switch (first) {
    case "days":
    case "entries":
      return ["days/", "progress/", "shares", "saved-meals", "photos", "billing", "ai/", "friends/week", "people/"]
    case "templates":
    case "routines":
    case "splits":
    case "weekly-plan":
    case "sessions":
    case "exercises":
      return GYM
    case "saved-meals":
      return ["saved-meals", "shop", "people/"]
    case "meal-slots":
      return ["meal-slots", "days/"]
    case "profile":
      // A new profile photo shows on every friend card and feed item.
      if (p.startsWith("profile/avatar")) return ["friends", "feed", "people/", "shares", "invite-links"]
      return ["goal", "progress/", "days/", "profile", "friends/week", "people/"]
    case "weigh-ins":
    case "goal":
    case "onboarding":
      return ["goal", "progress/", "days/", "profile", "friends/week", "people/"]
    case "shop":
      return ["shop", "people/", "templates", "routines", "saved-meals", "exercises"]
    case "shares":
      return ["shares", "days/", "progress/", "templates", "routines", "exercises"]
    case "friends":
    case "invite-links":
    case "sharing":
    case "feed":
      return ["friends", "feed", "people/", "sharing", "invite-links", "billing"]
    case "photos":
      return ["photos", "days/", "billing"]
    case "ai":
    case "billing":
      return ["billing", "ai/"]
    case "push":
    case "notification-prefs":
      return ["notification-prefs"]
    case "admin":
      return ["admin/", "shop", "people/"]
    default:
      return []
  }
}

/** Storage keys of persisted caches ("fl-cache:<user id>"). */
export const CACHE_KEY_PREFIX = "fl-cache:"

/** Forget everything cached in memory and on the device (sign-out). */
export function clearCache() {
  browserClient?.clear()
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k?.startsWith(CACHE_KEY_PREFIX)) localStorage.removeItem(k)
    }
  } catch {
    /* storage unavailable */
  }
}
