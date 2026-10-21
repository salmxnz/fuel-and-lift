"use client"

import { motion, useReducedMotion } from "motion/react"
import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react"
import { cn } from "@/lib/cn"
import { addDays, formatLong, parseISODate, startOfWeek, todayISO, weekdayLetter } from "@/lib/dates"
import { SPRING_SNAPPY } from "@/lib/motion"

const WEEKS_BACK = 26
const WEEKS_AHEAD = 8

/**
 * A small calendar strip, one week (Mon–Sun) per page. Swipe sideways for
 * earlier or later weeks (native scroll-snap); tap a day to pick it.
 */
export function WeekPager({
  selected,
  onSelect,
  renderDay,
  maxDate,
  dimAfter,
  onWeekChange,
  label = "Week",
  pillId = "week-pill",
}: {
  selected: string
  onSelect: (date: string) => void
  /** Extra content under the date number (a dot, a workout name). */
  renderDay?: (date: string) => ReactNode
  /** Days after this can't be picked. */
  maxDate?: string
  /** Days after this are dimmed (still pickable unless past maxDate). */
  dimAfter?: string
  /** Called with the Monday of the week in view, after each swipe. */
  onWeekChange?: (monday: string) => void
  label?: string
  /** Distinct per pager on a screen, for the selected-day pill animation. */
  pillId?: string
}) {
  const today = todayISO()
  const reduce = useReducedMotion()
  const scroller = useRef<HTMLDivElement>(null)
  const thisWeek = startOfWeek(today)
  const weeks = useMemo(
    () => Array.from({ length: WEEKS_BACK + 1 + WEEKS_AHEAD }, (_, i) => addDays(thisWeek, (i - WEEKS_BACK) * 7)),
    [thisWeek]
  )
  const selectedWeek = startOfWeek(selected)
  const pageOf = (monday: string) => weeks.indexOf(monday)
  const lastReported = useRef<string | null>(null)

  // Open on the selected day's week, without animating.
  useLayoutEffect(() => {
    const el = scroller.current
    const i = pageOf(selectedWeek)
    if (el && i >= 0) el.scrollLeft = i * el.clientWidth
    // Only on mount: later changes scroll smoothly below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // When the day changes from outside (a swipe on the page), bring its week into view.
  useEffect(() => {
    const el = scroller.current
    const i = pageOf(selectedWeek)
    if (!el || i < 0) return
    const target = i * el.clientWidth
    if (Math.abs(el.scrollLeft - target) > 4) el.scrollTo({ left: target, behavior: reduce ? "auto" : "smooth" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWeek])

  // Report the week in view after scrolling settles.
  useEffect(() => {
    const el = scroller.current
    if (!el || !onWeekChange) return
    let t: ReturnType<typeof setTimeout> | undefined
    const report = () => {
      const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth))
      const monday = weeks[Math.min(weeks.length - 1, Math.max(0, i))]
      if (monday && monday !== lastReported.current) {
        lastReported.current = monday
        onWeekChange(monday)
      }
    }
    const onScroll = () => {
      clearTimeout(t)
      t = setTimeout(report, 120)
    }
    report()
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      clearTimeout(t)
      el.removeEventListener("scroll", onScroll)
    }
  }, [weeks, onWeekChange])

  return (
    <div
      ref={scroller}
      role="group"
      aria-label={label}
      className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
    >
      {weeks.map((monday) => (
        <div key={monday} className="grid w-full flex-none snap-start snap-always grid-cols-7 gap-1">
          {Array.from({ length: 7 }, (_, d) => {
            const day = addDays(monday, d)
            const current = day === selected
            const disabled = !!maxDate && day > maxDate
            const dim = !!dimAfter && day > dimAfter
            return (
              <button
                key={day}
                type="button"
                disabled={disabled}
                onClick={() => onSelect(day)}
                aria-pressed={current}
                aria-label={formatLong(day)}
                className={cn(
                  "relative flex min-h-[48px] flex-col items-center gap-0.5 rounded-[12px] py-2 text-[12px] transition-transform duration-150 ease-out active:scale-[0.97] disabled:active:scale-100",
                  current ? "text-pink" : "text-muted",
                  (dim || disabled) && !current && "opacity-50"
                )}
              >
                {current ? (
                  <motion.span
                    layoutId={pillId}
                    transition={reduce ? { duration: 0 } : SPRING_SNAPPY}
                    className="absolute inset-0 rounded-[12px] bg-ink"
                    aria-hidden="true"
                  />
                ) : null}
                <span aria-hidden="true" className="relative">
                  {weekdayLetter(day)}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "relative text-[15px]",
                    current ? "font-bold text-white" : "font-semibold text-ink",
                    day === today && !current && "underline decoration-pink decoration-[3px] underline-offset-4"
                  )}
                >
                  {parseISODate(day).getDate()}
                </span>
                {renderDay ? <span className="relative flex min-h-[14px] w-full justify-center">{renderDay(day)}</span> : null}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/** A small dot under a day: filled when something happened. */
export function DayDot({ on, onDark }: { on: boolean; onDark?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn("mt-0.5 h-[5px] w-[5px] rounded-full", on ? (onDark ? "bg-pink" : "bg-protein") : "bg-transparent")}
    />
  )
}
