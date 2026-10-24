"use client"

import Link from "next/link"
import { useCallback, useMemo, useState } from "react"
import { CalendarIcon, CheckIcon, ListIcon } from "@/components/ui/icons"
import { Button, Skeleton } from "@/components/ui/primitives"
import { Sheet } from "@/components/ui/sheet"
import { WeekPager } from "@/components/ui/week-pager"
import type { Session, SessionsResponse, Template, WeeklyPlan } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { cn } from "@/lib/cn"
import { addDays, formatLong, startOfWeek, todayISO, weekdayKey, WEEKDAY_KEYS, type WeekdayKey } from "@/lib/dates"
import { useStoredChoice } from "@/lib/use-stored-choice"
import { ExerciseIcon } from "./exercise-icon"

const DAY_NAMES: Record<WeekdayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
}

/** "Upper-1" → "Upper-1"; long names shrink to fit a day cell. */
function shortName(name: string): string {
  return name.length > 7 ? `${name.slice(0, 6)}…` : name
}

/**
 * "Your week": a swipeable week strip (default) or the classic list of
 * dropdowns, toggled top-right. Tapping a day opens its plan and history.
 */
export function GymWeek({
  plan,
  templates,
  onSetDay,
  onStart,
  starting,
}: {
  plan: WeeklyPlan | null
  templates: Template[]
  onSetDay: (day: WeekdayKey, templateId: string | null) => void
  onStart: (templateId: string) => void
  starting: string | null
}) {
  const today = todayISO()
  const [view, setView] = useStoredChoice("adebite:gym-week-view", ["rows", "list"] as const, "rows")
  const [visibleWeek, setVisibleWeek] = useState(() => startOfWeek(today))
  const [openDay, setOpenDay] = useState<string | null>(null)
  // The pill stays on the last day opened after its sheet closes.
  const [picked, setPicked] = useState<string | null>(null)
  const selectedDay = openDay ?? picked ?? today
  const sessions = useApi<SessionsResponse>(view === "rows" ? `sessions?from=${visibleWeek}&to=${addDays(visibleWeek, 6)}` : null, {
    keepPrevious: true,
  })
  const byId = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates])
  const byDate = useMemo(() => {
    const m = new Map<string, Session>()
    for (const s of sessions.data?.sessions ?? []) {
      const prev = m.get(s.date)
      if (!prev || s.status === "finished") m.set(s.date, s)
    }
    return m
  }, [sessions.data])

  const todayKey = weekdayKey(today)

  const days = plan?.days
  const renderDay = useCallback(
    (d: string) => {
      const tplId = days?.[weekdayKey(d)]
      const t = tplId ? byId.get(tplId) : undefined
      const session = byDate.get(d)
      const done = session?.status === "finished"
      const selected = d === selectedDay
      // A day you trained shows what you did, even off-plan.
      const label = done && session?.template_name ? session.template_name : t ? t.name : "Rest"
      return (
        <span
          className={cn(
            "flex max-w-full items-center gap-0.5 truncate px-0.5 text-[10px] font-semibold leading-tight",
            selected ? "text-pink" : t || done ? "text-ink-soft" : "text-muted"
          )}
        >
          {done ? <CheckIcon size={10} className={selected ? "text-pink" : "text-protein"} /> : null}
          {label === "Rest" ? label : shortName(label)}
        </span>
      )
    },
    [days, byId, byDate, selectedDay]
  )

  return (
    <section aria-labelledby="week-title" className="flex flex-col gap-1 rounded-card bg-white px-3.5 pb-2 pt-1">
      <div className="flex items-center justify-between">
        <h2 id="week-title" className="m-0 pt-2 text-[13px] font-semibold text-muted">
          Your week
        </h2>
        <button
          type="button"
          onClick={() => setView(view === "rows" ? "list" : "rows")}
          aria-label={view === "rows" ? "Show the week as a list" : "Show the week as a strip"}
          className="-mr-1.5 mt-1 flex h-10 w-10 items-center justify-center rounded-[12px] text-ink transition-transform duration-150 ease-out hover:bg-ink/5 active:scale-[0.97]"
        >
          {view === "rows" ? <ListIcon size={20} /> : <CalendarIcon size={20} />}
        </button>
      </div>

      {!plan ? (
        <Skeleton className="my-1 h-[70px]" />
      ) : view === "rows" ? (
        <WeekPager
          selected={selectedDay}
          onSelect={(d) => {
            setPicked(d)
            setOpenDay(d)
          }}
          dimAfter={today}
          label="Your gym week"
          pillId="gym-day"
          onWeekChange={setVisibleWeek}
          renderDay={renderDay}
        />
      ) : (
        WEEKDAY_KEYS.map((d) => {
          const id = `plan-${d}`
          const value = plan.days[d] ?? ""
          return (
            <div key={d} className="flex min-h-[52px] items-center gap-3 border-b border-line-soft last:border-b-0">
              <label htmlFor={id} className={cn("w-[92px] flex-none text-[15px]", d === todayKey ? "font-bold" : "")}>
                {DAY_NAMES[d]}
              </label>
              <select
                id={id}
                value={value}
                onChange={(e) => onSetDay(d, e.target.value || null)}
                className={cn(
                  "min-h-[44px] min-w-0 flex-1 rounded-[12px] border border-line bg-white px-2.5 text-[15px]",
                  value ? "font-semibold text-ink" : "text-muted"
                )}
              >
                <option value="">Rest</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
                {value && !byId.has(value) ? <option value={value}>Archived template</option> : null}
              </select>
            </div>
          )
        })
      )}

      {plan ? (
        <DaySheet
          date={openDay}
          onClose={() => setOpenDay(null)}
          plan={plan}
          templates={templates}
          session={openDay ? byDate.get(openDay) : undefined}
          onSetDay={onSetDay}
          onStart={onStart}
          starting={starting}
        />
      ) : null}
    </section>
  )
}

/** One day, drilled into: its planned template (changeable), exercises, and what happened. */
function DaySheet({
  date,
  onClose,
  plan,
  templates,
  session,
  onSetDay,
  onStart,
  starting,
}: {
  date: string | null
  onClose: () => void
  plan: WeeklyPlan
  templates: Template[]
  session: Session | undefined
  onSetDay: (day: WeekdayKey, templateId: string | null) => void
  onStart: (templateId: string) => void
  starting: string | null
}) {
  const today = todayISO()
  const key = date ? weekdayKey(date) : "mon"
  const planned = plan.days[key] ?? null
  const t = planned ? templates.find((x) => x.id === planned) : undefined
  const isToday = date === today
  const isPast = !!date && date < today

  return (
    <Sheet open={!!date} onClose={onClose} title={date ? formatLong(date) : ""} description={`Plan for every ${DAY_NAMES[key]}`}>
      {session ? (
        <Link
          href={`/gym/session/${session.id}`}
          className="flex items-center justify-between gap-2 rounded-tile bg-white px-3.5 py-3 text-[15px] font-semibold no-underline"
        >
          <span className="flex items-center gap-2">
            {session.status === "finished" ? <CheckIcon size={18} className="text-protein" /> : null}
            {session.template_name ?? "Workout"} {session.status === "finished" ? "done" : "in progress"}
          </span>
          <span className="text-[13px] text-muted">
            {session.blocks.filter((b) => !b.skipped).length} exercises · Open
          </span>
        </Link>
      ) : isPast ? (
        <p className="m-0 rounded-tile bg-white px-3.5 py-3 text-[14px] text-muted">No workout logged that day.</p>
      ) : null}

      <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
        <legend className="mb-1.5 p-0 text-[13px] font-semibold text-muted">{DAY_NAMES[key]}s are for</legend>
        <div className="flex flex-wrap gap-1.5">
          {[{ id: null as string | null, name: "Rest" }, ...templates.map((x) => ({ id: x.id as string | null, name: x.name }))].map((o) => {
            const on = (o.id ?? null) === planned
            return (
              <button
                key={o.id ?? "rest"}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onSetDay(key, o.id)}
                className={cn(
                  "min-h-[40px] rounded-full border px-3.5 text-[14px] font-semibold transition-transform duration-150 ease-out active:scale-[0.97]",
                  on ? "border-ink bg-ink text-white" : "border-line bg-white text-ink"
                )}
              >
                {o.name}
              </button>
            )
          })}
        </div>
      </fieldset>

      {t ? (
        <ul aria-label={`${t.name} exercises`} className="m-0 flex list-none flex-col rounded-tile bg-white px-3 py-1">
          {[...t.blocks]
            .sort((a, b) => a.position - b.position)
            .map((b) => (
              <li key={b.id} className="flex min-h-[52px] items-center gap-2.5 border-b border-line-soft py-1.5 last:border-b-0">
                <ExerciseIcon exercise={b.exercise} size={40} className="rounded-[10px]" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px] font-bold">{b.exercise.name}</span>
                  <span className="text-[12px] text-muted">
                    {b.cardio ? `${b.cardio.minutes} min` : `${b.sets.filter((s) => !s.warmup).length} sets`}
                  </span>
                </span>
              </li>
            ))}
          {t.blocks.length === 0 ? <li className="py-3 text-[14px] text-muted">No exercises in {t.name} yet.</li> : null}
        </ul>
      ) : null}

      {t && isToday && !session ? (
        <Button variant="pink" onClick={() => onStart(t.id)} loading={starting === t.id} disabled={t.blocks.length === 0}>
          Start {t.name}
        </Button>
      ) : null}
      {t ? (
        <Link href={`/gym/templates/${t.id}`} className="self-center py-2 text-[14px] font-semibold text-protein">
          Edit {t.name}
        </Link>
      ) : null}
    </Sheet>
  )
}
