"use client"

// The day's calories as a sun rising out of the sky header's clouds. The arc
// fills as you eat; the middle says what's left. Over target, it turns rose.

import { animate, useMotionValue, useReducedMotion, useTransform, motion } from "motion/react"
import { useEffect } from "react"
import type { Day } from "@/lib/api/types"
import { kcal } from "@/lib/format"
import { cn } from "@/lib/cn"
import { EASE_IN_OUT } from "@/lib/motion"

const ARC = "M40 194A140 140 0 0 1 320 194"

export function CalorieSun({ day }: { day: Day }) {
  const eaten = Math.round(day.totals.kcal)
  const target = Math.round(day.target.kcal)
  const left = target - eaten
  const over = left < 0
  const share = target > 0 ? Math.min(eaten / target, 1) : 0
  const reduce = useReducedMotion()

  // The number counts to its new value instead of jumping.
  const shown = useMotionValue(Math.abs(left))
  const text = useTransform(shown, (v) => kcal(Math.round(v)))
  useEffect(() => {
    const c = animate(shown, Math.abs(left), { duration: reduce ? 0 : 0.6, ease: EASE_IN_OUT })
    return () => c.stop()
  }, [left, shown, reduce])

  return (
    // Full bleed and sitting low, so the sky's clouds cut across its base.
    <section aria-label="Calories" className="relative -mx-4 mt-1 h-[calc(min(108vw,420px)*0.5556+26px)] overflow-hidden">
      <svg
        viewBox="0 0 360 200"
        aria-hidden="true"
        className="absolute bottom-0 left-1/2 aspect-[360/200] w-[min(108vw,420px)] -translate-x-1/2 overflow-visible"
      >
        <defs>
          <radialGradient id="sun-glow" cx="50%" cy="97%" r="55%">
            <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
            <stop offset="0.7" stopColor="#fff" stopOpacity="0.35" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="180" cy="194" r="180" fill="url(#sun-glow)" />
        <circle
          className="sun-ring"
          cx="180"
          cy="194"
          r="164"
          fill="none"
          stroke="#fff"
          strokeWidth="3"
          strokeDasharray="1 11"
          strokeLinecap="round"
        />
        <path d={ARC} fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="20" strokeLinecap="round" />
        <path
          d={ARC}
          fill="none"
          stroke={over ? "var(--color-protein)" : "#F09CB8"}
          strokeWidth="20"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="100"
          style={{
            strokeDashoffset: eaten > 0 ? 100 - share * 100 : 100,
            transition: reduce ? "none" : "stroke-dashoffset 700ms var(--ease-in-out), stroke 300ms",
          }}
        />
        <circle cx="180" cy="194" r="120" fill="#fff" />
      </svg>

      <div className="absolute inset-x-0 bottom-[40px] flex flex-col items-center text-center">
        <motion.span
          aria-hidden="true"
          className={cn(
            "text-[clamp(40px,13.4vw,50px)] font-black leading-[0.9] tracking-[-0.06em]",
            over ? "text-protein" : "text-ink"
          )}
        >
          {text}
        </motion.span>
        <span className="mt-1 text-[14px] font-bold text-ink-soft">{over ? "kcal over" : "kcal to go"}</span>
        <span className="mt-0.5 text-[13px] text-muted">
          {kcal(eaten)} eaten of {kcal(target)}
        </span>
        <span className="sr-only">
          {over ? `${kcal(-left)} kcal over` : `${kcal(left)} kcal to go`}, {kcal(eaten)} eaten of {kcal(target)}
        </span>
      </div>
    </section>
  )
}
