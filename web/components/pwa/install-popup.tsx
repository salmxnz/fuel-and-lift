"use client"

// Our own "Add to Home Screen" popup. It slides up after a delay (or once the
// visitor scrolls past a point) on phones that can install: iPhone gets the
// Share steps, Chrome gets its install dialog (Chrome may also show its own
// bar; that's fine). "Not now" hides it for two weeks, and it never shows once
// adebite is installed.

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import Image from "next/image"
import { useEffect, useState } from "react"
import { InstallCta } from "@/components/landing/install-cta"
import { CloseIcon } from "@/components/ui/icons"
import { useInstallPlatform, useInstallPrompt } from "@/lib/install"

const SNOOZE_KEY = "fl:install-popup-snoozed"
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000
const EASE_OUT = [0.23, 1, 0.32, 1] as const

/** The visitor said "Not now" to installing in the last two weeks. */
export function snoozed(): boolean {
  try {
    const at = Number(localStorage.getItem(SNOOZE_KEY))
    return at > 0 && Date.now() - at < SNOOZE_MS
  } catch {
    return false
  }
}

export function InstallPopup({
  delayMs = 6000,
  afterScrollPx,
  bottom = "calc(var(--safe-bottom) + 12px)",
  hidden = false,
  onShowChange,
}: {
  delayMs?: number
  /** Also open once the page has scrolled this far. */
  afterScrollPx?: number
  /** Distance from the bottom edge, e.g. above the tab bar. */
  bottom?: string
  /** Hold it back while something else owns the screen (the walkthrough). */
  hidden?: boolean
  /** Told whenever it appears or goes, so other popups can wait their turn. */
  onShowChange?: (show: boolean) => void
}) {
  const platform = useInstallPlatform()
  const { canPrompt, justInstalled } = useInstallPrompt()
  const [open, setOpen] = useState(false)
  const reduce = useReducedMotion()

  // Desktop without an install prompt has nothing useful to offer.
  const eligible =
    platform !== null &&
    platform !== "installed" &&
    !justInstalled &&
    (platform === "ios-safari" || platform === "ios-other" || platform === "android" || canPrompt)

  useEffect(() => {
    if (!eligible || hidden || snoozed()) return
    const timer = window.setTimeout(() => setOpen(true), delayMs)
    const onScroll = () => {
      if (afterScrollPx !== undefined && window.scrollY > afterScrollPx) setOpen(true)
    }
    if (afterScrollPx !== undefined) window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener("scroll", onScroll)
    }
  }, [eligible, hidden, delayMs, afterScrollPx])

  function snooze() {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now()))
    } catch {
      /* private mode: it just comes back next visit */
    }
    setOpen(false)
  }

  const show = open && eligible && !hidden
  useEffect(() => onShowChange?.(show), [show, onShowChange])

  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          key="install-popup"
          role="dialog"
          aria-labelledby="install-popup-title"
          className="fixed inset-x-0 z-40 mx-auto w-full max-w-[440px] px-3"
          style={{ bottom }}
          initial={{ opacity: 0, transform: reduce ? "none" : "translateY(24px)" }}
          animate={{ opacity: 1, transform: reduce ? "none" : "translateY(0px)", transition: { duration: 0.28, ease: EASE_OUT } }}
          exit={{ opacity: 0, transform: reduce ? "none" : "translateY(16px)", transition: { duration: 0.18, ease: EASE_OUT } }}
        >
          <div className="flex flex-col gap-4 rounded-[24px] bg-white p-4 shadow-[0_12px_40px_-8px_rgba(46,26,36,0.28),0_0_0_1px_rgba(46,26,36,0.06)]">
            <div className="flex items-start gap-3.5">
              <Image src="/icons/icon-192.png" alt="" width={192} height={192} className="h-14 w-14 flex-none rounded-[14px]" />
              <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
                <h2 id="install-popup-title" className="m-0 text-[17px] font-extrabold leading-[1.2] tracking-[-0.01em]">
                  Put adebite on your Home Screen
                </h2>
                <p className="m-0 text-[14px] leading-[1.4] text-muted">Opens full screen with its own icon and reminders. Takes ten seconds.</p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={snooze}
                className="-mr-2 -mt-2 flex h-11 w-11 flex-none items-center justify-center rounded-full text-muted transition-[background-color,transform] duration-150 ease-out hover:bg-chip active:scale-[0.94]"
              >
                <CloseIcon size={18} />
              </button>
            </div>
            <div className="flex flex-col gap-1">
              <InstallCta showNote={false} fullWidth />
              <button
                type="button"
                onClick={snooze}
                className="min-h-[44px] rounded-tile text-[15px] font-bold text-muted transition-[color,transform] duration-150 ease-out hover:text-ink active:scale-[0.97]"
              >
                Not now
              </button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
