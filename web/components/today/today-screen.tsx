"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import Link from "next/link"
import { toast } from "sonner"
import { useRouter, useSearchParams } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAddFlow } from "@/components/food/add-flow"
import { CalendarIcon, PlusIcon } from "@/components/ui/icons"
import { Avatar, Button, ErrorCard, Skeleton, TextInput } from "@/components/ui/primitives"
import { displayName, useMe } from "@/components/me-context"
import { Sheet } from "@/components/ui/sheet"
import { DayDot, WeekPager } from "@/components/ui/week-pager"
import type { Day, DayResponse, Entry, MealSlotsResponse, ProgressCaloriesResponse, SavedMealsResponse, SuggestionsResponse } from "@/lib/api/types"
import { api } from "@/lib/api/client"
import { useApi } from "@/lib/api/use-api"
import { addDays, dayTitle, isISODate, startOfWeek, todayISO } from "@/lib/dates"
import { Sky, SkyTitle, SKY_ICON } from "@/components/ui/sky"
import { cn } from "@/lib/cn"
import { PAGE_SLIDE, pageVariants, swipeDirection } from "@/lib/motion"
import { CalorieSun } from "./calorie-sun"
import { MacroCard } from "./macro-card"
import { EntrySheet } from "./entry-sheet"
import { MealList } from "./meal-list"
import { IncomingMeals } from "@/components/share/incoming-shares"
import { ShareMealSheet } from "@/components/share/share-meal-sheet"
import { ShopLink } from "@/components/community/shop-link"

export function TodayScreen() {
  const me = useMe()
  const router = useRouter()
  const params = useSearchParams()
  const today = todayISO()
  const raw = params.get("date")
  const paramDate = isISODate(raw) ? raw : today
  // The day on screen. Changing it is local (plus a history.replaceState for
  // the URL), so day taps and swipes never wait for a server round trip. A
  // real navigation to /today?date=… still wins.
  const [date, setShownDate] = useState(paramDate)
  const [seenParam, setSeenParam] = useState(paramDate)
  if (paramDate !== seenParam) {
    setSeenParam(paramDate)
    setShownDate(paramDate)
  }
  const isToday = date === today
  const isPast = date < today
  // Meals can be planned up to two weeks ahead.
  const maxDate = addDays(today, 14)

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
    if (d === date || d > maxDate) return
    setDir(d > date ? 1 : -1)
    setShownDate(d)
    window.history.replaceState(null, "", d === today ? "/today" : `/today?date=${d}`)
  }

  // Dots under days with something logged, for the week in view. The old
  // week's dots stay while the next week loads.
  const [visibleWeek, setVisibleWeek] = useState(() => startOfWeek(date))
  const calories = useApi<ProgressCaloriesResponse>(`progress/calories?from=${visibleWeek}&to=${addDays(visibleWeek, 6)}`, {
    keepPrevious: true,
  })
  const logged = useMemo(() => new Set((calories.data?.days ?? []).filter((d) => d.logged).map((d) => d.date)), [calories.data])
  const shownHasFood = !!day.data?.day.meals.some((m) => m.entries.length > 0)
  const renderDay = useCallback(
    (d: string) => <DayDot on={logged.has(d) || (d === date && shownHasFood)} />,
    [logged, date, shownHasFood]
  )

  // The days either side are fetched ahead, so swiping lands on data.
  const queryClient = useQueryClient()
  const dayLoaded = !!day.data
  useEffect(() => {
    if (!dayLoaded) return
    for (const d of [addDays(date, -1), addDays(date, 1)]) {
      if (d <= maxDate) void queryClient.prefetchQuery({ queryKey: [`days/${d}`] })
    }
  }, [dayLoaded, date, maxDate, queryClient])

  // A meal you just logged: offer to split it with whoever you ate with.
  useAteWithPrompt(day.data?.day ?? null, setSharing)

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
      <Sky className="pb-2">
        <SkyTitle title={dayTitle(date, today)}>
          <ShopLink kind="meal" className={SKY_ICON} />
          <label className={cn(SKY_ICON, "relative cursor-pointer")}>
            <span className="sr-only">Pick a date</span>
            <CalendarIcon size={20} />
            <input
              ref={dateInput}
              type="date"
              value={date}
              max={maxDate}
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
          {/* A 44 px target that's always on screen: the title shrinks first. */}
          <Link
            href="/me"
            aria-label="Me: profile and settings"
            data-tour="me"
            className="flex h-11 w-11 flex-none items-center justify-center rounded-full transition-transform duration-[160ms] ease-out active:scale-[0.95]"
          >
            <Avatar name={displayName(me)} url={me.user.avatar_url} size={42} tone="ink" />
          </Link>
        </SkyTitle>

        <div className="mt-3">
          <WeekPager
            selected={date}
            onSelect={goTo}
            maxDate={maxDate}
            dimAfter={today}
            label="Pick a day"
            pillId="today-day"
            onWeekChange={setVisibleWeek}
            renderDay={renderDay}
          />
        </div>

        {day.data && day.data.day.date === date ? (
          <CalorieSun day={day.data.day} />
        ) : (
          <div className="mx-auto mt-2 aspect-[360/200] w-full max-w-[360px]" aria-hidden="true" />
        )}
      </Sky>

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
          // Rubber band past the last day you can plan.
          dragElastic={date >= maxDate ? { left: 0.06, right: 0.3 } : 0.3}
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
              <Skeleton className="h-[118px] rounded-card" />
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-[110px] rounded-card" />
              <Skeleton className="h-[86px] rounded-card" />
            </div>
          ) : (
            <>
              <MacroCard day={day.data.day} />

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

/** Ate-with prompts already shown, so each meal is asked about once. */
const ASKED_KEY = "fl:ate-with-asked"

/**
 * When a meal shows up that was logged in the last two minutes, ask whether
 * you ate it with someone, naming a friend who logged something similar.
 */
function useAteWithPrompt(day: Day | null, onSplit: (e: Entry) => void) {
  const seen = useRef<{ date: string; ids: Set<string> } | null>(null)
  useEffect(() => {
    if (!day) return
    const entries = day.meals.flatMap((m) => m.entries)
    const prev = seen.current
    seen.current = { date: day.date, ids: new Set(entries.map((e) => e.id)) }
    let asked: string[] = []
    try {
      asked = JSON.parse(sessionStorage.getItem(ASKED_KEY) ?? "[]") as string[]
    } catch {
      /* private mode */
    }
    const fresh = entries
      .filter((e) => (prev && prev.date === day.date ? !prev.ids.has(e.id) : true))
      .filter((e) => Date.now() - new Date(e.logged_at).getTime() < 120_000)
      .filter((e) => !asked.includes(e.id) && e.split_ways == null && e.shared_with.length === 0 && e.kcal >= 250 && e.origin !== "shared")
      .sort((a, b) => (a.logged_at < b.logged_at ? 1 : -1))[0]
    if (!fresh) return
    try {
      sessionStorage.setItem(ASKED_KEY, JSON.stringify([...asked, fresh.id].slice(-30)))
    } catch {
      /* private mode */
    }
    const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z\u00c0-\u024f]+/).filter((w) => w.length >= 4))
    const mine = words(fresh.name)
    void api
      .get<SuggestionsResponse>("suggestions", { date: day.date })
      .catch(() => null)
      .then((sug) => {
        const match = sug?.friends.find((f) => f.entry_id !== fresh.id && [...words(f.name)].some((w) => mine.has(w)))
        toast(match ? `${match.person.name} had ${match.name} too. Eat together?` : "Ate that with anyone?", {
          description: "Split it and they get their share in one tap.",
          duration: 7000,
          action: { label: "Split it", onClick: () => onSplit(fresh) },
        })
      })
  }, [day, onSplit])
}
