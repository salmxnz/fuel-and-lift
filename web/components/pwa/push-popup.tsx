"use client"

// "Turn on notifications" for people who signed up without them: maybe they
// said no thanks in onboarding, or tried while the server couldn't send push
// yet. It only shows when turning them on would work right now (supported
// here, not blocked, the server has its keys) and this device isn't
// subscribed. "Not now" hides it for two weeks. The first time adebite is
// opened from the Home Screen it comes up at once instead of after a delay.
// It stays off the Friends tab, which has its own banner.

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useTour } from "@/components/tour/tour"
import { BellIcon, CloseIcon } from "@/components/ui/icons"
import { Button } from "@/components/ui/primitives"
import { api, errorMessage } from "@/lib/api/client"
import type { VapidKeyResponse } from "@/lib/api/types"
import { installPlatform } from "@/lib/install"
import {
  PUSH_CHANGED_EVENT,
  currentSubscription,
  enablePush,
  firstAppLaunch,
  markAskedInApp,
  pushPromptSnoozed,
  pushSupport,
  snoozePushPrompt,
} from "@/lib/push"
import { snoozed as installSnoozed } from "./install-popup"

const EASE_OUT = [0.23, 1, 0.32, 1] as const

/** Whether to offer push on this device at all (before asking the server). */
function worthAsking(): boolean {
  if (pushPromptSnoozed() || !pushSupport().ok) return false
  // A phone browser that can still install gets the install popup first
  // (it promises reminders); once that's dismissed, this one may show. On a
  // computer they can both qualify: this one waits while that one is up.
  const platform = installPlatform()
  return platform === "installed" || platform === "desktop" || installSnoozed()
}

export function PushPopup({
  delayMs = 3000,
  bottom,
  hidden: held = false,
}: {
  delayMs?: number
  bottom: string
  /** Hold it back while another popup is up (install). */
  hidden?: boolean
}) {
  const tour = useTour()
  const pathname = usePathname()
  const reduce = useReducedMotion()
  const [eligible, setEligible] = useState(false)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!worthAsking()) return
    void (async () => {
      if (await currentSubscription()) return
      // Only once the server can actually send (GET 503s without VAPID keys).
      const res = await api.get<VapidKeyResponse>("push/vapid-public-key").catch(() => null)
      if (!cancelled && res?.key) setEligible(true)
    })()
    // Turned on somewhere else (the Friends banner, Settings).
    const onChange = () => {
      void currentSubscription().then((sub) => {
        if (!cancelled && sub) {
          setEligible(false)
          setOpen(false)
        }
      })
    }
    window.addEventListener(PUSH_CHANGED_EVENT, onChange)
    return () => {
      cancelled = true
      window.removeEventListener(PUSH_CHANGED_EVENT, onChange)
    }
  }, [])

  const hidden =
    held || tour.active || (pathname?.startsWith("/gym/session") ?? false) || pathname === "/friends"
  useEffect(() => {
    if (!eligible || hidden) return
    const timer = window.setTimeout(
      () => {
        markAskedInApp()
        setOpen(true)
      },
      firstAppLaunch() ? 600 : delayMs
    )
    return () => window.clearTimeout(timer)
  }, [eligible, hidden, delayMs])

  function later() {
    snoozePushPrompt()
    setOpen(false)
  }

  async function turnOn() {
    setBusy(true)
    try {
      await enablePush()
      toast.success("Notifications are on. Pick which ones in Settings.")
      setEligible(false)
      setOpen(false)
    } catch (err) {
      toast.error(errorMessage(err))
      // Blocked just now: asking again won't help on this device.
      if (typeof Notification !== "undefined" && Notification.permission === "denied") {
        snoozePushPrompt(true)
        setOpen(false)
      }
    } finally {
      setBusy(false)
    }
  }

  const show = open && eligible && !hidden

  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          key="push-popup"
          role="dialog"
          aria-labelledby="push-popup-title"
          aria-describedby="push-popup-body"
          className="fixed inset-x-0 z-40 mx-auto w-full max-w-[440px] px-3"
          style={{ bottom }}
          initial={{ opacity: 0, transform: reduce ? "none" : "translateY(24px)" }}
          animate={{ opacity: 1, transform: reduce ? "none" : "translateY(0px)", transition: { duration: 0.28, ease: EASE_OUT } }}
          exit={{ opacity: 0, transform: reduce ? "none" : "translateY(16px)", transition: { duration: 0.18, ease: EASE_OUT } }}
        >
          <div className="flex flex-col gap-4 rounded-[24px] bg-white p-4 shadow-[0_12px_40px_-8px_rgba(46,26,36,0.28),0_0_0_1px_rgba(46,26,36,0.06)]">
            <div className="flex items-start gap-3.5">
              <span aria-hidden="true" className="flex h-14 w-14 flex-none items-center justify-center rounded-[14px] bg-pink text-ink">
                <BellIcon size={26} strokeWidth={1.9} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
                <h2 id="push-popup-title" className="m-0 text-[17px] font-extrabold leading-[1.2] tracking-[-0.01em]">
                  Turn on notifications
                </h2>
                <p id="push-popup-body" className="m-0 text-[14px] leading-[1.4] text-muted">
                  Get reminders for your meals, hear when friends hit their goal or cheer your workout, and keep your streak alive.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={later}
                className="-mr-2 -mt-2 flex h-11 w-11 flex-none items-center justify-center rounded-full text-muted transition-[background-color,transform] duration-150 ease-out hover:bg-chip active:scale-[0.94]"
              >
                <CloseIcon size={18} />
              </button>
            </div>
            <div className="flex flex-col gap-1">
              <Button onClick={() => void turnOn()} loading={busy}>
                Turn on
              </Button>
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={later}
                  disabled={busy}
                  className="min-h-[44px] rounded-tile text-[15px] font-bold text-muted transition-[color,transform] duration-150 ease-out hover:text-ink active:scale-[0.97]"
                >
                  Not now
                </button>
                <Link
                  href="/settings/notifications"
                  onClick={() => setOpen(false)}
                  className="flex min-h-[44px] items-center justify-center rounded-tile text-[15px] font-bold text-protein transition-transform duration-150 ease-out active:scale-[0.97]"
                >
                  Choose which
                </Link>
              </div>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
