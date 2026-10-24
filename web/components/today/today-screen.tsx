"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { useAddFlow } from "@/components/food/add-flow"
import { CalendarIcon, PlusIcon } from "@/components/ui/icons"
import { Button, ErrorCard, Skeleton, TextInput } from "@/components/ui/primitives"
import { Sheet } from "@/components/ui/sheet"
import { DayDot, WeekPager } from "@/components/ui/week-pager"
import type { DayResponse, Entry, MealSlotsResponse, ProgressCaloriesResponse, SavedMealsResponse } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { addDays, formatLong, isISODate, parseISODate, startOfWeek, todayISO } from "@/lib/dates"
import { PAGE_SLIDE, pageVariants, swipeDirection } from "@/lib/motion"
import { CalorieCard } from "./calorie-card"
import { EntrySheet } from "./entry-sheet"
import { MealList } from "./meal-list"
import { IncomingMeals } from "@/components/share/incoming-shares"
import { ShareMealSheet } from "@/components/share/share-meal-sheet"
import { ShopLink } from "@/components/community/shop-link"

export function TodayScreen() {
  const router = useRouter()
  const params = useSearchParams()
  const today = todayISO()
  const raw = params.get("date")
  const date = isISODate(raw) ? raw : today
  const isToday = date === today
  const isPast = date < today

  const day = useApi<DayResponse>(`days/${date}`)
  const slots = useApi<MealSlotsResponse>("meal-slots")
  const hasSaved = !!day.data?.day.meals.some((m) => m.entries.some((e) => e.saved_meal_id))
  const saved = useApi<SavedMealsResponse>(hasSaved ? "saved-meals" : null)

  const flow = useAddFlow()
  const { setDate, lastDay, openFood } = flow
  const [editing, setEditing] = useState<Entry | null>(null)
  const [sharing, setSharing] = useState<Entry | null>(null)
  const [oneOffOpen, setOneOffOpen] = useState(false)
  const dateInput = useRef<HTMLInputElement>(null)
  const reduce = useReducedMotion()

  // Which way the day changed, so the new one slides in from that side.
  const [dir, setDir] = useState(0)
  function goTo(d: string) {
    if (d === date || d > today) return
    setDir(d > date ? 1 : -1)
    router.replace(d === today ? "/today" : `/today?date=${d}`, { scroll: false })
  }

  // Dots under days with something logged, for the week in view.
  const [visibleWeek, setVisibleWeek] = useState(() => startOfWeek(date))
  const calories = useApi<ProgressCaloriesResponse>(`progress/calories?from=${visibleWeek}&to=${addDays(visibleWeek, 6)}`)
  const logged = useMemo(() => new Set((calories.data?.days ?? []).filter((d) => d.logged).map((d) => d.date)), [calories.data])

  // New food from the + menu goes to the day on screen.
  useEffect(() => {
    setDate(date)
  }, [date, setDate])

  // A log action elsewhere (Again chips) returned a fresh Day.
  const setDayData = day.setData
  useEffect(() => {
    if (lastDay && lastDay.date === date) setDayData({ day: lastDay })
  }, [lastDay, date, setDayData])

  // Manifest shortcut: /today?add=food
  const addParam = params.get("add")
  useEffect(() => {
    if (addParam !== "food") return
    openFood()
    router.replace(date === today ? "/today" : `/today?date=${date}`, { scroll: false })
  }, [addParam, openFood, router, date, today])

  return (
    <div className="flex flex-col gap-3.5">
      <header className="flex items-end justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-[14px] text-muted">{formatLong(date)}</span>
          <h1 className="m-0 text-[30px] font-extrabold tracking-[-0.02em]">
            {isToday ? "Today" : parseISODate(date).toLocaleDateString("en-GB", { weekday: "long" })}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {!isToday ? (
            <button
              type="button"
              onClick={() => goTo(today)}
              className="flex min-h-[44px] items-center rounded-[12px] bg-white px-3 text-[14px] font-semibold text-ink transition-transform duration-150 ease-out active:scale-[0.97]"
            >
              Today
            </button>
          ) : null}
          <ShopLink kind="meal" />
          <label className="relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-[12px] bg-white text-ink">
            <span className="sr-only">Pick a date</span>
            <CalendarIcon size={20} />
            <input
              ref={dateInput}
              type="date"
              value={date}
              max={today}
              onChange={(e) => {
                const v = e.target.value
                if (isISODate(v)) goTo(v)
              }}
              onClick={(e) => {
                try {
                  e.currentTarget.showPicker?.()
                } catch {
                  /* not supported: the native control still opens */
                }
              }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
        </div>
      </header>

      <WeekPager
        selected={date}
        onSelect={goTo}
        maxDate={today}
        label="Pick a day"
        pillId="today-day"
        onWeekChange={setVisibleWeek}
        renderDay={(d) => <DayDot on={logged.has(d) || (d === date && !!day.data?.day.meals.some((m) => m.entries.length > 0))} />}
      />

      <IncomingMeals
        slots={slots.data?.meal_slots ?? []}
        viewing={date}
        onDayChange={(d) => day.setData({ day: d })}
        onGoTo={goTo}
      />

      {/* Swipe the day sideways to go to the day before or after. */}
      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        <motion.div
          key={date}
          custom={dir}
          variants={reduce ? undefined : pageVariants}
          initial={reduce ? { opacity: 0 } : "enter"}
          animate={reduce ? { opacity: 1 } : "center"}
          exit={reduce ? { opacity: 0 } : "exit"}
          transition={PAGE_SLIDE}
          drag="x"
          dragDirectionLock
          dragConstraints={{ left: 0, right: 0 }}
          // Rubber band past today: there's nothing to swipe to.
          dragElastic={isToday ? { left: 0.06, right: 0.3 } : 0.3}
          onDragEnd={(_, info) => {
            const d = swipeDirection(info.offset.x, info.velocity.x, window.innerWidth)
            if (d !== 0) goTo(addDays(date, d))
          }}
          className="flex flex-col gap-3.5"
        >
          {day.error && !day.data ? (
            <ErrorCard message={day.error.message} onRetry={() => void day.reload()} />
          ) : !day.data ? (
            <div role="status" className="flex flex-col gap-3.5">
              <span className="sr-only">Loading your day…</span>
              <Skeleton className="h-[152px] rounded-card" />
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-[110px] rounded-card" />
              <Skeleton className="h-[86px] rounded-card" />
            </div>
          ) : (
            <>
              <CalorieCard day={day.data.day} />

              <div className="-mb-1 mt-0.5 flex items-center justify-between">
                <h2 className="m-0 text-[17px] font-extrabold">Meals</h2>
                <button
                  type="button"
                  onClick={() => setOneOffOpen(true)}
                  className="flex min-h-[36px] items-center gap-1.5 rounded-full border-[1.5px] border-dashed border-dash px-3 text-[13px] font-semibold text-ink"
                >
                  <PlusIcon size={16} />
                  {isToday ? "Add a meal today" : "Add a meal"}
                </button>
              </div>

              {day.data.day.meals.length === 0 ? (
                <div className="flex flex-col items-start gap-3 rounded-card border-[1.5px] border-dashed border-dash p-4">
                  <span className="text-[15px]">No meals set up yet.</span>
                  <Link href="/meals" className="text-[14px] font-semibold text-protein">
                    Set up your meals
                  </Link>
                </div>
              ) : (
                <MealList
                  day={day.data.day}
                  isPastDay={isPast}
                  savedMeals={saved.data?.saved_meals}
                  onAdd={(target) => openFood(target)}
                  onEdit={setEditing}
                  onDayChange={(d) => day.setData({ day: d })}
                />
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>

      <EntrySheet
        entry={editing}
        slots={slots.data?.meal_slots ?? []}
        onClose={() => setEditing(null)}
        onDayChange={(d) => day.setData({ day: d })}
        onShare={(e) => {
          setEditing(null)
          setSharing(e)
        }}
      />

      <ShareMealSheet entry={sharing} onClose={() => setSharing(null)} onDayChange={(d) => day.setData({ day: d })} />

      <OneOffMealSheet
        open={oneOffOpen}
        onClose={() => setOneOffOpen(false)}
        onPick={(name) => {
          setOneOffOpen(false)
          openFood({ mealName: name, label: name })
        }}
      />
    </div>
  )
}

function OneOffMealSheet({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (name: string) => void
}) {
  const [name, setName] = useState("")
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add a meal today"
      description="Just for this day, like a late-night snack. Your usual meals stay as they are."
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          const n = name.trim()
          if (!n) return
          onPick(n.slice(0, 60))
          setName("")
        }}
      >
        <label htmlFor="oneoff-name" className="text-[13px] font-semibold text-muted">
          Meal name
        </label>
        <TextInput
          id="oneoff-name"
          data-autofocus
          placeholder="Late snack"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" disabled={!name.trim()}>
          Continue
        </Button>
      </form>
    </Sheet>
  )
}
