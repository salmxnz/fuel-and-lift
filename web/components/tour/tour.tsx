"use client"

import { motion, useReducedMotion } from "motion/react"
import { usePathname, useRouter } from "next/navigation"
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react"
import { useAddFlow } from "@/components/food/add-flow"
import { useMe } from "@/components/me-context"
import { Button } from "@/components/ui/primitives"
import { api, ENTRY_LOGGED_EVENT } from "@/lib/api/client"
import { cn } from "@/lib/cn"
import { EASE_OUT, SPRING_SNAPPY } from "@/lib/motion"

// The walkthrough after onboarding: log a first meal (optional), find your
// way around the tabs, then friends. Every step can be skipped; nothing in
// the app is blocked while it shows. Finishing or skipping is saved on the
// server (profile.tour_done_at) so it doesn't come back on another device.

type Step = {
  /** data-tour value of the element to highlight; null = a centred card. */
  target: string | null
  title: string
  body: string
  /** Route the target lives on (we go there first). */
  route?: string
  /** Extra button, e.g. "Show me" opens the + menu. */
  action?: "openMenu"
  actionLabel?: string
  nextLabel?: string
  /** Round cutout (the + button) vs rounded rect. */
  round?: boolean
}

const STEPS: Step[] = [
  {
    target: "fab",
    title: "Log your first meal",
    body: "Tap + to snap a photo or type what you ate, and we'll estimate it. No rush: you can do it any time.",
    action: "openMenu",
    actionLabel: "Show me",
    nextLabel: "Not now",
    round: true,
  },
  { target: "tab-today", title: "Today", body: "Your calories and meals for the day. Swipe left or right to see other days." },
  { target: "tab-gym", title: "Gym", body: "Your week plan and workout templates. Tap a day to see what's on, then start." },
  { target: "tab-progress", title: "Progress", body: "Weight, strength and your streak, with badges as you keep it going." },
  { target: "tab-me", title: "Me", body: "Settings, saved meals, your photos and your plan." },
  {
    target: "friends-row",
    route: "/me",
    title: "Your friends",
    body: "See when friends work out or hit a streak, and cheer them on.",
  },
  {
    target: "add-friend",
    route: "/me",
    title: "Add a friend",
    body: "Send a link to add someone. When 8 friends join through your links, you get Pro forever.",
  },
  { target: null, title: "You're set", body: "That's everything. Show me around again any time from Me.", nextLabel: "Let's go" },
]

type TourValue = { start: () => void; active: boolean }
const TourContext = createContext<TourValue>({ start: () => {}, active: false })
export const useTour = () => useContext(TourContext)

export function TourProvider({ children }: { children: ReactNode }) {
  const me = useMe()
  // null = not running. Starts on first visit after onboarding.
  const [step, setStep] = useState<number | null>(() => (me.profile && !me.profile.tour_done_at ? 0 : null))
  const [loggedNote, setLoggedNote] = useState(false)

  // Step 1 ("Log your first meal"): closing the + menu or the food sheet,
  // logged or not, moves on to the next step by itself.
  const { flowOpen } = useAddFlow()
  const [prevFlowOpen, setPrevFlowOpen] = useState(flowOpen)
  if (flowOpen !== prevFlowOpen) {
    setPrevFlowOpen(flowOpen)
    if (!flowOpen && step === 0) setStep(1)
  }

  const finish = useCallback(() => {
    setStep(null)
    void api.patch("profile", { tour_done: true }).catch(() => undefined)
  }, [])

  const start = useCallback(() => {
    setLoggedNote(false)
    setStep(0)
    void api.patch("profile", { tour_done: false }).catch(() => undefined)
  }, [])

  // Logging a meal during step 1 moves the tour on by itself.
  useEffect(() => {
    if (step !== 0) return
    const onLogged = () => {
      setLoggedNote(true)
      setStep(1)
    }
    window.addEventListener(ENTRY_LOGGED_EVENT, onLogged)
    return () => window.removeEventListener(ENTRY_LOGGED_EVENT, onLogged)
  }, [step])

  return (
    <TourContext.Provider value={{ start, active: step !== null }}>
      {children}
      {step !== null ? (
        <Spotlight
          key={step}
          step={step}
          note={loggedNote && step === 1 ? "First meal logged: day 1 of your streak 🔥" : null}
          onNext={() => (step >= STEPS.length - 1 ? finish() : setStep(step + 1))}
          onSkip={finish}
        />
      ) : null}
    </TourContext.Provider>
  )
}

type Rect = { top: number; left: number; width: number; height: number }

/** Where the target is on screen, kept up to date; null while it isn't there. */
function useTargetRect(target: string | null): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null)
  useEffect(() => {
    // Each step mounts its own Spotlight, so a centred step simply never measures.
    if (!target) return
    let el: Element | null = null
    let ro: ResizeObserver | null = null
    const measure = () => {
      if (!el || !el.isConnected) el = document.querySelector(`[data-tour="${target}"]`)
      if (!el) return setRect(null)
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    // The target may not be rendered yet (route still loading): watch for it.
    const mo = new MutationObserver(() => {
      if (!el) {
        measure()
        if (el) {
          ro = new ResizeObserver(measure)
          ro.observe(el)
        }
      }
    })
    measure()
    if (el) {
      ro = new ResizeObserver(measure)
      ro.observe(el)
    }
    mo.observe(document.body, { childList: true, subtree: true })
    window.addEventListener("resize", measure)
    window.addEventListener("scroll", measure, true)
    return () => {
      mo.disconnect()
      ro?.disconnect()
      window.removeEventListener("resize", measure)
      window.removeEventListener("scroll", measure, true)
    }
  }, [target])
  return rect
}

function Spotlight({ step, note, onNext, onSkip }: { step: number; note: string | null; onNext: () => void; onSkip: () => void }) {
  const s = STEPS[step]
  const router = useRouter()
  const pathname = usePathname()
  const reduce = useReducedMotion()
  const { openMenu, flowOpen } = useAddFlow()
  const rect = useTargetRect(s.target)
  const titleId = useId()
  const primary = useRef<HTMLButtonElement>(null)
  // After 2s without the target, show the card in the middle anyway.
  const [gaveUp, setGaveUp] = useState(false)

  useEffect(() => {
    if (s.route && pathname !== s.route) router.push(s.route)
  }, [s.route, pathname, router])

  useEffect(() => {
    const t = setTimeout(() => setGaveUp(true), 2000)
    return () => clearTimeout(t)
  }, [])

  const shown = s.target === null || !!rect || gaveUp
  useEffect(() => {
    if (shown) primary.current?.focus({ preventScroll: true })
  }, [shown])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSkip()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onSkip])

  // Out of the way while the + menu or a food/weigh-in sheet is open.
  if (flowOpen) return null
  if (!shown) return null

  const pad = 6
  const hole = rect
    ? { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }
    : null
  const below = !!hole && hole.top + hole.height / 2 < (typeof window !== "undefined" ? window.innerHeight / 2 : 400)
  const vh = typeof window !== "undefined" ? window.innerHeight : 800

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]" aria-live="polite">
      {/* The dimmed page with a hole over the target. Taps go through: the
          tour never blocks the app. */}
      {hole ? (
        <motion.div
          aria-hidden="true"
          className="absolute"
          initial={false}
          animate={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
          transition={reduce ? { duration: 0 } : SPRING_SNAPPY}
          style={{
            borderRadius: s.round ? 9999 : 18,
            boxShadow: "0 0 0 9999px rgba(46, 26, 36, 0.5)",
          }}
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 bg-[rgba(46,26,36,0.5)]" />
      )}

      {/* Positioning layer (no transform) + the card, which scales in from
          the side facing the target. */}
      <div
        className="absolute inset-x-0 flex justify-center px-4"
        style={
          hole
            ? below
              ? { top: hole.top + hole.height + 14 }
              : { bottom: vh - hole.top + 14 }
            : { top: "50%", marginTop: -110 }
        }
      >
        <motion.div
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          initial={reduce ? { opacity: 0 } : { opacity: 0, transform: "scale(0.96)" }}
          animate={{ opacity: 1, transform: "scale(1)" }}
          transition={{ duration: 0.2, ease: EASE_OUT }}
          className="pointer-events-auto w-full max-w-[360px]"
          style={{ transformOrigin: hole ? (below ? "top center" : "bottom center") : "center" }}
        >
          <div className="mx-auto flex flex-col gap-2.5 rounded-card bg-white p-4 shadow-float">
            {note ? (
              <span className="self-start rounded-full bg-pink-soft px-2.5 py-1 text-[12px] font-bold text-ink">{note}</span>
            ) : null}
            <div className="flex items-center justify-between gap-2">
              <h2 id={titleId} className="m-0 text-[18px] font-extrabold tracking-[-0.01em]">
                {s.title}
              </h2>
              <span className="flex gap-1" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
                {STEPS.map((_, i) => (
                  <span key={i} aria-hidden="true" className={cn("h-1.5 rounded-full transition-[width,background-color] duration-200", i === step ? "w-4 bg-ink" : "w-1.5 bg-line")} />
                ))}
              </span>
            </div>
            <p className="m-0 text-[14px] leading-[1.45] text-ink-soft">{s.body}</p>
            <div className="mt-1 flex items-center gap-2">
              {step < STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={onSkip}
                  className="mr-auto min-h-[40px] px-1 text-[13px] font-semibold text-muted transition-transform duration-150 ease-out active:scale-[0.97]"
                >
                  Skip tour
                </button>
              ) : (
                <span className="mr-auto" />
              )}
              {s.action === "openMenu" ? (
                <>
                  <Button size="sm" variant="outline" onClick={onNext}>
                    {s.nextLabel ?? "Next"}
                  </Button>
                  <Button ref={primary} size="sm" variant="pink" onClick={openMenu}>
                    {s.actionLabel}
                  </Button>
                </>
              ) : (
                <Button ref={primary} size="sm" onClick={onNext}>
                  {s.nextLabel ?? "Next"}
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
