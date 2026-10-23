// "Add to Home Screen" helpers shared by the landing page and onboarding.
//
// Chromium fires beforeinstallprompt once the PWA is installable; we keep the
// event so our own button can call prompt(). The listener is registered when
// this module first loads (not in an effect) so an early event isn't missed.
// iOS has no install API: there we can only show the Share → Add to Home
// Screen steps, and only Safari can do it reliably.

import { useCallback, useSyncExternalStore } from "react"
import { isIOS, isStandalone } from "./push"

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

let deferred: BeforeInstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener("appinstalled", () => {
    deferred = null
    installed = true
    emit()
  })
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** The browser's install prompt, when it has offered one. Each event can be used once. */
export function useInstallPrompt() {
  const canPrompt = useSyncExternalStore(subscribe, () => deferred !== null, () => false)
  const justInstalled = useSyncExternalStore(subscribe, () => installed, () => false)

  const prompt = useCallback(async (): Promise<boolean> => {
    const e = deferred
    if (!e) return false
    deferred = null
    emit()
    await e.prompt().catch(() => undefined)
    const choice = await e.userChoice.catch(() => null)
    return choice?.outcome === "accepted"
  }, [])

  return { canPrompt, justInstalled, prompt }
}

export type InstallPlatform =
  | "installed" // already running from the Home Screen
  | "ios-safari" // Share → Add to Home Screen
  | "ios-other" // Chrome/Firefox/in-app browsers on iOS: send them to Safari
  | "android"
  | "desktop"

// Other iOS browsers and in-app web views (Instagram, Facebook, TikTok, Gmail…).
const IOS_NOT_SAFARI = /CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|DuckDuckGo|YaBrowser|FBAN|FBAV|Instagram|Line\/|Twitter|TikTok|musical_ly|Snapchat|LinkedInApp|Pinterest/i

export function installPlatform(): InstallPlatform {
  if (isStandalone()) return "installed"
  const ua = navigator.userAgent
  if (isIOS()) return /Safari\//.test(ua) && !IOS_NOT_SAFARI.test(ua) ? "ios-safari" : "ios-other"
  if (/Android/i.test(ua)) return "android"
  return "desktop"
}

const subscribeNoop = () => () => {}

/** null during SSR and hydration, then the visitor's platform. */
export function useInstallPlatform(): InstallPlatform | null {
  return useSyncExternalStore(subscribeNoop, installPlatform, () => null)
}
