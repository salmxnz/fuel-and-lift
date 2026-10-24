// Web Push subscribe flow:
// GET /api/v1/push/vapid-public-key → pushManager.subscribe → POST /api/v1/push/subscriptions

import { api } from "./api/client"
import type { VapidKeyResponse } from "./api/types"

export type PushSupport =
  | { ok: true }
  | { ok: false; reason: "unsupported" | "ios-not-installed" | "denied" }

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent
  // iPadOS 13+ reports itself as a Mac with touch.
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1)
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** iOS Safari (not yet installed): push only works from the Home Screen app. */
export function needsIOSInstall(): boolean {
  return isIOS() && !isStandalone()
}

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return { ok: false, reason: "unsupported" }
  if (needsIOSInstall()) return { ok: false, reason: "ios-not-installed" }
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return { ok: false, reason: "unsupported" }
  }
  if (Notification.permission === "denied") return { ok: false, reason: "denied" }
  return { ok: true }
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/")
  if (existing) return existing
  await navigator.serviceWorker.register("/sw.js", { scope: "/" })
  return navigator.serviceWorker.ready
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport().ok !== true) return null
  try {
    const reg = await navigator.serviceWorker.getRegistration("/")
    return (await reg?.pushManager.getSubscription()) ?? null
  } catch {
    return null
  }
}

/**
 * Ask permission (must run from a user gesture on iOS), subscribe, and send
 * the subscription to the API. Throws an Error with a user-facing message.
 */
export async function enablePush(): Promise<PushSubscription> {
  const support = pushSupport()
  if (!support.ok) {
    if (support.reason === "ios-not-installed") {
      throw new Error("On iPhone, add adebite to your Home Screen first, then turn on notifications from there.")
    }
    if (support.reason === "denied") {
      throw new Error("Notifications are blocked. Allow them for this site in your browser settings.")
    }
    throw new Error("This browser doesn't support notifications.")
  }

  const permission = await Notification.requestPermission()
  if (permission !== "granted") throw new Error("Notifications weren't allowed.")

  const { key } = await api.get<VapidKeyResponse>("push/vapid-public-key")
  if (!key) throw new Error("Notifications aren't set up on the server yet.")

  const reg = await registration()
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) })
  }
  const json = sub.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error("The browser returned an incomplete subscription.")
  await api.post("push/subscriptions", {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    user_agent: navigator.userAgent.slice(0, 250),
  })
  return sub
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  try {
    await api.del("push/subscriptions", { endpoint: sub.endpoint })
  } finally {
    await sub.unsubscribe().catch(() => undefined)
  }
}

// The "Turn on notifications" popup (components/pwa/push-popup.tsx): "Not now"
// hides it for two weeks; turning push off in Settings hides it for good.
const PROMPT_SNOOZE_KEY = "fl:push-popup-snoozed"
const PROMPT_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000

export function pushPromptSnoozed(): boolean {
  try {
    const raw = localStorage.getItem(PROMPT_SNOOZE_KEY)
    if (raw === "never") return true
    const at = Number(raw)
    return at > 0 && Date.now() - at < PROMPT_SNOOZE_MS
  } catch {
    return false
  }
}

/** Hide the popup for two weeks, or for good on this device. */
export function snoozePushPrompt(forGood = false) {
  try {
    localStorage.setItem(PROMPT_SNOOZE_KEY, forGood ? "never" : String(Date.now()))
  } catch {
    /* private mode: it just comes back next visit */
  }
}
