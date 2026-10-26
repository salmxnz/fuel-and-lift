"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useSyncExternalStore } from "react"
import { api } from "@/lib/api/client"
import { todayISO } from "@/lib/dates"
import { flushQueue, useOnline, useOutbox } from "@/lib/offline-queue"

// Keeps the app usable without signal:
// - sends the outbox (lib/offline-queue.ts) on reconnect, when the app comes
//   back to the front and every 20 s while anything waits
// - while online, has the service worker keep every main screen (and the
//   files they load), and loads the data the offline flows need, so the gym
//   works offline even on a screen not opened since the last update
// - shows a small pill while offline or while changes wait to be sent

const WARM_KEY = "fl-warm-at"
const WARM_EVERY_MS = 6 * 60 * 60 * 1000

const PAGES = [
  "/today",
  "/meals",
  "/gym",
  "/progress",
  "/me",
  "/friends",
  "/saved-meals",
  "/log/manual",
  "/weigh-in",
  // Stand-ins for any workout (public/sw.js shellFor).
  "/gym/session/_",
  "/gym/session/_/review",
]

/** Data the offline flows read from the cache (start a workout, add an exercise, log a meal). */
const DATA = ["templates", "weekly-plan", "gym/insights", "exercises?q=", "saved-meals", "meal-slots"]

export function OfflineSync() {
  const ops = useOutbox()
  const online = useOnline()
  const phoneOnline = usePhoneOnline()
  const client = useQueryClient()
  const waiting = ops.length

  // Send what's waiting. With one bar and no data the phone still says it's
  // online: keep trying (sending, or a small request) until one gets through.
  useEffect(() => {
    if (!phoneOnline || (online && waiting === 0)) return
    const tick = () => (waiting > 0 ? void flushQueue() : void api.get("auth/me").catch(() => undefined))
    tick()
    const t = window.setInterval(tick, 20_000)
    const onVisible = () => {
      if (document.visibilityState === "visible") tick()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearInterval(t)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [phoneOnline, online, waiting])

  // Back from no data: refresh what's on screen.
  const wasOnline = useRef(online)
  useEffect(() => {
    if (online && !wasOnline.current) void client.invalidateQueries()
    wasOnline.current = online
  }, [online, client])

  // Keep the screens and data for later.
  useEffect(() => {
    if (!online) return
    let cancelled = false
    const t = window.setTimeout(async () => {
      if (!(await dueForWarming()) || cancelled) return
      for (const path of [...DATA, `days/${todayISO()}`]) void client.prefetchQuery({ queryKey: [path] }).catch(() => undefined)
      if (!("serviceWorker" in navigator)) return
      const reg = await navigator.serviceWorker.ready
      if (cancelled || !reg.active) return
      reg.active.postMessage({ type: "warm", urls: PAGES })
      try {
        localStorage.setItem(WARM_KEY, String(Date.now()))
      } catch {
        /* storage unavailable */
      }
      // After a pause, so the first screen's own requests go first.
    }, 4000)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [online, client])

  if (online && waiting === 0) return null
  const text = online
    ? `Syncing ${waiting} change${waiting === 1 ? "" : "s"}…`
    : waiting > 0
      ? `Offline · ${waiting} change${waiting === 1 ? "" : "s"} saved on this phone`
      : "Offline · showing saved data"
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 6px)" }}
    >
      <span className="rounded-full border border-line bg-surface/95 px-3 py-1 text-[12px] font-semibold text-ink-soft shadow-[0_6px_18px_-10px_rgba(46,26,36,0.35)]">
        {text}
      </span>
    </div>
  )
}

/** Every few hours, or at once when the kept pages are gone (a new service worker version). */
async function dueForWarming(): Promise<boolean> {
  let last = 0
  try {
    last = Number(localStorage.getItem(WARM_KEY)) || 0
  } catch {
    /* storage unavailable */
  }
  if (Date.now() - last >= WARM_EVERY_MS) return true
  if (typeof caches === "undefined") return false
  try {
    const name = (await caches.keys()).find((k) => k.endsWith("-pages"))
    return !name || !(await (await caches.open(name)).match(new URL("/gym/session/_", location.origin).href))
  } catch {
    return false
  }
}

function subscribePhone(fn: () => void) {
  window.addEventListener("online", fn)
  window.addEventListener("offline", fn)
  return () => {
    window.removeEventListener("online", fn)
    window.removeEventListener("offline", fn)
  }
}

/** What the phone itself says about its network. */
function usePhoneOnline(): boolean {
  return useSyncExternalStore(
    subscribePhone,
    () => navigator.onLine,
    () => true
  )
}
