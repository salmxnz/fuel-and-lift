"use client"

import { useSyncExternalStore } from "react"
import { pushSupport } from "@/lib/push"

// Rest alerts on a locked phone. A web app can't run Apple's Live Activities,
// so this is the closest it gets:
// - when the app goes to the background mid-rest, a silent notification says
//   when rest ends and what's next (it replaces itself, tag rest-<session>);
// - the server sends a push when rest is over (POST sessions/{id}/rest), which
//   replaces that notification and buzzes, even with the phone locked;
// - if the app is open when rest ends, that push is cancelled just before, so
//   the in-app timer is the only alert.
// They need notifications allowed (lib/push.ts) and can be turned off here.

const OFF_KEY = "fl:rest-alerts-off"
const tag = (sessionId: string) => `rest-${sessionId}`

export function restAlertsOn(): boolean {
  if (typeof window === "undefined" || !("Notification" in window)) return false
  try {
    return Notification.permission === "granted" && localStorage.getItem(OFF_KEY) !== "1"
  } catch {
    return false
  }
}

export function setRestAlertsOff(off: boolean) {
  try {
    if (off) localStorage.setItem(OFF_KEY, "1")
    else localStorage.removeItem(OFF_KEY)
  } catch {
    /* private mode */
  }
  listeners.forEach((l) => l())
}

const listeners = new Set<() => void>()
function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}
// "<on>|<offerable>": a string so the snapshot compares by value.
function snapshot() {
  const p = pushSupport()
  // On an iPhone not yet on the Home Screen, the button explains how.
  return `${restAlertsOn() ? 1 : 0}|${p.ok || p.reason !== "unsupported" ? 1 : 0}`
}

/** Whether rest alerts are on, and whether this device can have them at all. */
export function useRestAlerts(): { on: boolean; offerable: boolean; refresh: () => void } {
  const v = useSyncExternalStore(subscribe, snapshot, () => "0|0")
  return { on: v[0] === "1", offerable: v[2] === "1", refresh: () => listeners.forEach((l) => l()) }
}

// Plain fetches: these aren't data changes, so nothing needs refreshing.
function call(method: "POST" | "DELETE", sessionId: string, body?: unknown) {
  return fetch(`/api/v1/sessions/${encodeURIComponent(sessionId)}/rest`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => undefined)
}

/** Ask the server to push "Rest's over" in `seconds`, replacing any earlier one. */
export function scheduleRestPush(sessionId: string, seconds: number, next: string) {
  if (!restAlertsOn()) return
  void call("POST", sessionId, { seconds: Math.max(5, Math.round(seconds)), next })
}

export function cancelRestPush(sessionId: string) {
  void call("DELETE", sessionId)
}

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  try {
    return await navigator.serviceWorker?.getRegistration("/")
  } catch {
    return undefined
  }
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })

/** The silent "resting until 14:32" notification, while the app is in the background. */
export async function showResting(sessionId: string, endAt: number, next: string) {
  if (!restAlertsOn()) return
  const reg = await registration()
  await reg
    ?.showNotification(`Resting until ${clock(endAt)}`, {
      tag: tag(sessionId),
      body: next ? `Next: ${next}` : "You'll get a buzz when it's time",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      silent: true,
      data: { url: `/gym/session/${sessionId}` },
    })
    .catch(() => undefined)
}

export async function clearResting(sessionId: string) {
  const reg = await registration()
  const list = await reg?.getNotifications({ tag: tag(sessionId) }).catch(() => [])
  list?.forEach((n) => n.close())
}
