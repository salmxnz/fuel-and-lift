"use client"

// "Notifications are off" at the top of the Friends tab: what you're missing
// (meal reminders, friends' goals, cheers) and the one step that fixes it on
// this device. Turn on here; on an iPhone in Safari, how to add adebite to
// the Home Screen first; when blocked, where to allow them. The close button
// hides it for a week. Shows nothing while push is on, can't work in this
// browser, or the server has no push keys.

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { IOSInstallSteps } from "@/components/settings/notifications-screen"
import { BellIcon, CloseIcon } from "@/components/ui/icons"
import { Sheet } from "@/components/ui/sheet"
import { api, errorMessage } from "@/lib/api/client"
import type { VapidKeyResponse } from "@/lib/api/types"
import { PUSH_CHANGED_EVENT, currentSubscription, enablePush, pushSupport } from "@/lib/push"

type State = "off" | "ios-install" | "denied"

const SNOOZE_KEY = "fl:push-banner-snoozed"
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000

function snoozed(): boolean {
  try {
    const at = Number(localStorage.getItem(SNOOZE_KEY))
    return at > 0 && Date.now() - at < SNOOZE_MS
  } catch {
    return false
  }
}

async function check(): Promise<State | null> {
  if (snoozed()) return null
  const support = pushSupport()
  if (!support.ok && support.reason === "unsupported") return null
  if (support.ok && (await currentSubscription())) return null
  // Nothing to offer until the server can send (the key 503s without VAPID).
  const res = await api.get<VapidKeyResponse>("push/vapid-public-key").catch(() => null)
  if (!res?.key) return null
  if (!support.ok) return support.reason === "ios-not-installed" ? "ios-install" : "denied"
  return "off"
}

export function PushBanner() {
  const [state, setState] = useState<State | null>(null)
  const [busy, setBusy] = useState(false)
  const [howTo, setHowTo] = useState(false)

  useEffect(() => {
    let cancelled = false
    const refresh = () => void check().then((s) => !cancelled && setState(s))
    refresh()
    window.addEventListener(PUSH_CHANGED_EVENT, refresh)
    return () => {
      cancelled = true
      window.removeEventListener(PUSH_CHANGED_EVENT, refresh)
    }
  }, [])

  if (!state) return null

  function dismiss() {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now()))
    } catch {
      /* private mode: it comes back next visit */
    }
    setState(null)
  }

  async function turnOn() {
    setBusy(true)
    try {
      await enablePush()
      toast.success("Notifications are on. Pick which ones in Me → Notifications.")
      setState(null)
    } catch (err) {
      toast.error(errorMessage(err))
      if (typeof Notification !== "undefined" && Notification.permission === "denied") setState("denied")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="push-banner-title" className="flex flex-col gap-3 rounded-card bg-ink p-3.5 text-white">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex h-11 w-11 flex-none items-center justify-center rounded-[12px] bg-pink text-ink">
          <BellIcon size={22} strokeWidth={1.9} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 id="push-banner-title" className="m-0 text-[16px] font-extrabold leading-[1.25]">
            {state === "denied" ? "Notifications are blocked" : "Notifications are off"}
          </h2>
          <p className="m-0 text-[13px] leading-[1.4] text-night-muted">
            {state === "denied"
              ? "Allow notifications for adebite in your browser or phone settings, then come back here."
              : "You'll miss your meal reminders, friends hitting their goals and cheers on your workouts."}
          </p>
        </div>
        <button
          type="button"
          aria-label="Hide for a week"
          onClick={dismiss}
          className="-mr-1.5 -mt-1.5 flex h-11 w-11 flex-none items-center justify-center rounded-full text-night-muted transition-transform duration-150 ease-out active:scale-[0.94]"
        >
          <CloseIcon size={18} />
        </button>
      </div>
      {state === "off" ? (
        <button
          type="button"
          onClick={() => void turnOn()}
          disabled={busy}
          aria-busy={busy || undefined}
          className="min-h-[46px] rounded-btn bg-pink text-[15px] font-extrabold text-ink transition-[transform,opacity] duration-150 ease-out enabled:active:scale-[0.97] disabled:opacity-60"
        >
          {busy ? "Turning on…" : "Turn on notifications"}
        </button>
      ) : state === "ios-install" ? (
        <button
          type="button"
          onClick={() => setHowTo(true)}
          className="min-h-[46px] rounded-btn bg-pink text-[15px] font-extrabold text-ink transition-transform duration-150 ease-out active:scale-[0.97]"
        >
          Show me how
        </button>
      ) : null}
      <Sheet open={howTo} onClose={() => setHowTo(false)} title="Add adebite to your Home Screen">
        <div className="flex flex-col gap-3">
          <IOSInstallSteps />
          <p className="m-0 text-[13px] leading-[1.45] text-muted">
            Open adebite from the new icon and sign in if it asks. It will offer to turn on notifications straight away.
          </p>
        </div>
      </Sheet>
    </section>
  )
}
