"use client"

// A week or a month at a glance, like the Monday recap email: days logged,
// the daily average against target, workouts and weight change, then the
// calories per day. Arrows (or a swipe) move between periods.

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import type { ReactNode } from "react"
import { ChevronRightIcon, DumbbellIcon, FireIcon, PencilIcon, ScaleIcon } from "@/components/ui/icons"
import { Skeleton } from "@/components/ui/primitives"
import type { ProgressCaloriesResponse, ProgressWeightResponse, SessionsResponse } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { cn } from "@/lib/cn"
import { addDays, addMonths, formatDayMonth, parseISODate, startOfWeek, toISODate, weekdayLetter } from "@/lib/dates"
import { kcal, signed } from "@/lib/format"
import { EASE_OUT, swipeDirection } from "@/lib/motion"

type View = "week" | "month"

/** The period `offset` steps back from today's week or month. */
export function periodOf(view: View, offset: number, today: string) {
  if (view === "week") {
    const from = addDays(startOfWeek(today), offset * 7)
    return { from, to: addDays(from, 6) }
  }
  const t = parseISODate(today)
  const first = toISODate(new Date(t.getFullYear(), t.getMonth() + offset, 1, 12))
  const last = addDays(addMonths(first, 1), -1)
  return { from: first, to: last }
}

function label(view: View, offset: number, from: string, to: string) {
  if (view === "week") {
    if (offset === 0) return "This week"
    if (offset === -1) return "Last week"
    const sameMonth = from.slice(0, 7) === to.slice(0, 7)
    return sameMonth ? `${parseISODate(from).getDate()}–${formatDayMonth(to)}` : `${formatDayMonth(from)} – ${formatDayMonth(to)}`
  }
  if (offset === 0) return "This month"
  const d = parseISODate(from)
  return d.toLocaleDateString("en-GB", { month: "long", ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) })
}

export function PeriodRecap({
  view,
  offset,
  onOffset,
  today,
}: {
  view: View
  offset: number
  onOffset: (n: number) => void
  today: string
}) {
  const reduce = useReducedMotion()
  const { from, to } = periodOf(view, offset, today)
  const until = to < today ? to : today
  const calories = useApi<ProgressCaloriesResponse>(`progress/calories?from=${from}&to=${to}`, { keepPrevious: true })
  const sessions = useApi<SessionsResponse>(`sessions?from=${from}&to=${until}`, { keepPrevious: true })
  // A little before the period too, so a weigh-in just before it counts as the start.
  const weight = useApi<ProgressWeightResponse>(`progress/weight?from=${addDays(from, -10)}&to=${until}`, { keepPrevious: true })

  const days = (calories.data?.days ?? []).filter((d) => d.date >= from && d.date <= to)
  const elapsed = days.filter((d) => d.date <= today)
  const logged = elapsed.filter((d) => d.logged && d.kcal > 0)
  const avg = logged.length ? logged.reduce((s, d) => s + d.kcal, 0) / logged.length : 0
  const target = days.find((d) => d.target_kcal > 0)?.target_kcal ?? 0
  const onTarget = logged.filter((d) => target > 0 && Math.abs(d.kcal - target) <= target * 0.1).length
  const workouts = (sessions.data?.sessions ?? []).filter((x) => x.status === "finished" && x.date >= from && x.date <= to).length
  const ins = [...(weight.data?.weigh_ins ?? [])].sort((a, b) => (a.date < b.date ? -1 : 1))
  const before = ins.filter((w) => w.date < from).pop() ?? ins.find((w) => w.date >= from)
  const after = [...ins].reverse().find((w) => w.date <= to)
  const change = before && after && before.id !== after.id ? after.weight_kg - before.weight_kg : null
  const loading = !calories.data || !sessions.data

  const tiles: { icon: ReactNode; label: string; value: string; note: string }[] = [
    { icon: <PencilIcon size={16} />, label: "Days logged", value: `${logged.length} / ${elapsed.length || days.length}`, note: `${onTarget} on target` },
    { icon: <FireIcon size={16} />, label: "Average a day", value: avg ? kcal(avg) : "–", note: target ? `Target ${kcal(target)} kcal` : "kcal" },
    { icon: <DumbbellIcon size={16} />, label: "Workouts", value: String(workouts), note: workouts === 1 ? "Session finished" : "Sessions finished" },
    { icon: <ScaleIcon size={16} />, label: "Weight", value: change == null ? "–" : `${signed(change, 1)} kg`, note: change == null ? "Weigh in to see it move" : "Over the period" },
  ]

  return (
    <section aria-label={`Recap, ${label(view, offset, from, to)}`} className="mt-3 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label={view === "week" ? "Previous week" : "Previous month"}
          onClick={() => onOffset(offset - 1)}
          className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-white/85 bg-white/65 backdrop-blur-md transition-transform duration-150 ease-out active:scale-[0.94]"
        >
          <ChevronRightIcon size={20} className="rotate-180" />
        </button>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={`${view}-${offset}`}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            className="text-[17px] font-extrabold tracking-[-0.02em]"
            aria-live="polite"
          >
            {label(view, offset, from, to)}
          </motion.span>
        </AnimatePresence>
        <button
          type="button"
          aria-label={view === "week" ? "Next week" : "Next month"}
          disabled={offset >= 0}
          onClick={() => onOffset(offset + 1)}
          className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-white/85 bg-white/65 backdrop-blur-md transition-transform duration-150 ease-out active:scale-[0.94] disabled:opacity-35"
        >
          <ChevronRightIcon size={20} />
        </button>
      </div>

      <motion.div
        drag={reduce ? false : "x"}
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={offset >= 0 ? { left: 0.06, right: 0.3 } : 0.3}
        onDragEnd={(_, info) => {
          const d = swipeDirection(info.offset.x, info.velocity.x, window.innerWidth)
          if (d === 1 && offset < 0) onOffset(offset + 1)
          if (d === -1) onOffset(offset - 1)
        }}
        className="flex touch-pan-y flex-col gap-3"
      >
        <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0">
          {tiles.map((t) => (
            <li key={t.label} className="ticket flex h-[112px] flex-col justify-between rounded-[20px] bg-white/80 px-3.5 py-3 backdrop-blur-md">
              <span className="flex items-center gap-2 text-[12.5px] font-semibold text-ink-soft">
                <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-pink-soft text-protein">{t.icon}</span>
                {t.label}
              </span>
              {loading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <span className="flex flex-col">
                  <span className="text-[26px] font-black leading-none tracking-[-0.045em]">{t.value}</span>
                  <span className="mt-1 text-[11.5px] text-muted">{t.note}</span>
                </span>
              )}
            </li>
          ))}
        </ul>

        <CaloriesChart days={days} today={today} target={target} view={view} loading={!calories.data} />
      </motion.div>
    </section>
  )
}

function CaloriesChart({
  days,
  today,
  target,
  view,
  loading,
}: {
  days: ProgressCaloriesResponse["days"]
  today: string
  target: number
  view: View
  loading: boolean
}) {
  const H = 96
  const maxVal = Math.max(target * 1.25, ...days.map((d) => d.kcal), 1)
  const targetY = target > 0 ? H - (target / maxVal) * H : 0
  const logged = days.filter((d) => d.kcal > 0)
  const summary = logged.length === 0 ? "Nothing logged in this period" : `${logged.length} days logged, ${logged.map((d) => `${d.date} ${kcal(d.kcal)} kcal`).join(", ")}`
  const month = view === "month"
  return (
    <div className="flex flex-col gap-2 rounded-[20px] bg-white/80 p-3.5 backdrop-blur-md">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-muted">Calories a day</span>
        {target ? <span className="text-[12px] text-muted">Target {kcal(target)}</span> : null}
      </div>
      {loading ? (
        <Skeleton className="h-[96px]" />
      ) : (
        <>
          <div role="img" aria-label={summary} className={cn("relative grid items-end", month ? "gap-[3px]" : "gap-2")} style={{ height: H, gridTemplateColumns: `repeat(${days.length || 7}, minmax(0, 1fr))` }}>
            {target ? <span aria-hidden="true" className="absolute inset-x-0 border-t border-dashed border-dash" style={{ top: targetY }} /> : null}
            {days.map((d, i) => {
              const v = d.kcal
              const h = v > 0 ? Math.max(6, (v / maxVal) * H) : 4
              const isToday = d.date === today
              return (
                <span
                  key={d.date}
                  className={cn(
                    "bar-grow box-border origin-bottom",
                    month ? "rounded-[3px]" : "rounded-md",
                    d.date > today ? "bg-line-soft/60" : v <= 0 ? "bg-line-soft" : isToday ? "hatch-pink border-[1.5px] border-ink" : target && v > target * 1.1 ? "bg-fat" : "bg-pink"
                  )}
                  style={{ height: h, animationDelay: `${i * (month ? 12 : 40)}ms` }}
                />
              )
            })}
          </div>
          <div aria-hidden="true" className="grid text-center text-[11px] text-muted" style={{ gridTemplateColumns: `repeat(${days.length || 7}, minmax(0, 1fr))` }}>
            {days.map((d, i) => (
              <span key={d.date} className={d.date === today ? "font-bold text-ink" : undefined}>
                {month ? (i % 7 === 0 ? parseISODate(d.date).getDate() : "") : weekdayLetter(d.date)}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
