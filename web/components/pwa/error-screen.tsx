"use client"

import { useEffect, useSyncExternalStore } from "react"

function subscribe(fn: () => void) {
  window.addEventListener("online", fn)
  window.addEventListener("offline", fn)
  return () => {
    window.removeEventListener("online", fn)
    window.removeEventListener("offline", fn)
  }
}

/**
 * What a screen shows when it crashed (app/(app)/error.tsx, app/global-error.tsx).
 * Without signal it says so and tries again by itself once the network is back.
 */
export function ErrorScreen({ error, retry }: { error: Error; retry: () => void }) {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true
  )
  const offline = !online || error.message.includes("offline") || error.message.includes("Failed to fetch")

  useEffect(() => {
    if (!offline) return
    window.addEventListener("online", retry)
    return () => window.removeEventListener("online", retry)
  }, [offline, retry])

  return (
    <main className="app-column pb-safe flex min-h-dvh flex-col justify-center gap-4">
      <h1 className="m-0 text-[30px] font-extrabold leading-[1.05] tracking-[-0.02em]">
        {offline ? "You're offline" : "Something went wrong"}
      </h1>
      <p className="m-0 text-[15px] leading-[1.45] text-muted">
        {offline
          ? "Your changes are saved on this phone. This screen comes back as soon as you're online."
          : "Try again, or go back."}
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={retry} className="min-h-[52px] flex-1 rounded-btn bg-ink text-[16px] font-bold text-white">
          Try again
        </button>
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? window.history.back() : window.location.assign("/today"))}
          className="min-h-[52px] flex-1 rounded-btn border border-line bg-surface text-[16px] font-bold text-ink"
        >
          Back
        </button>
      </div>
    </main>
  )
}
