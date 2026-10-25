"use client"

// Sharing: one big choice up top (what new stuff starts as, and whether to
// open up everything that's still private), then the switches for what
// friends see, grouped, then which friend pings you get.

import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { displayName, useMe } from "@/components/me-context"
import { VisibilityIcon } from "@/components/community/visibility-select"
import { Button, ErrorCard, PageHeader, Skeleton, Switch } from "@/components/ui/primitives"
import { BowlIcon, DumbbellIcon, FireIcon, ScaleIcon } from "@/components/ui/icons"
import { Sheet } from "@/components/ui/sheet"
import { api, errorMessage } from "@/lib/api/client"
import type {
  NotificationPrefs,
  NotificationPrefsResponse,
  PersonalRecord,
  ProgressRecordsResponse,
  Session,
  SessionsResponse,
  Sharing,
  SharingPutResponse,
  SharingResponse,
  Visibility,
} from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { cn } from "@/lib/cn"
import { addDays, todayISO } from "@/lib/dates"
import { num1 } from "@/lib/format"

type BoolKey = { [K in keyof Sharing]: Sharing[K] extends boolean ? K : never }[keyof Sharing]

const GROUPS: { title: string; icon: ReactNode; rows: { key: BoolKey; title: string; sub: string }[] }[] = [
  {
    title: "Training",
    icon: <DumbbellIcon size={18} />,
    rows: [
      { key: "training_now", title: "At the gym now", sub: "Friends see you're training and can jump in with you" },
      { key: "workouts", title: "Finished workouts", sub: "That you trained today, and which workout" },
      { key: "workout_details", title: "The numbers", sub: "Exercises, sets and weights" },
      { key: "records", title: "Personal records", sub: "New best lifts" },
    ],
  },
  {
    title: "Food",
    icon: <BowlIcon size={18} />,
    rows: [
      { key: "meals", title: "What you eat", sub: "Meal names and times, never calories. Friends can join you." },
      { key: "weekly_summary", title: "Your week", sub: "Days on target and streak on the Friends tab, never calories" },
      { key: "food_streaks", title: "Streaks", sub: "Milestones like 7 days in a row" },
    ],
  },
  {
    title: "Body",
    icon: <ScaleIcon size={18} />,
    rows: [{ key: "weight_trend", title: "Weight trend", sub: "Up, down or steady and milestones, never the number" }],
  },
]

const DEFAULTS: { v: Visibility; title: string; sub: string }[] = [
  { v: "private", title: "Just me", sub: "New stuff stays private" },
  { v: "friends", title: "Friends", sub: "Your crew sees it" },
  { v: "public", title: "Everyone", sub: "Out in the Shop" },
]

type PreviewData = { session?: Session; record?: PersonalRecord }

/**
 * What friends would see, as one sentence, built from your latest finished
 * workout and record when you have them.
 */
export function previewSentence(s: Sharing, name: string, data: PreviewData): string {
  const parts: string[] = []
  const session = data.session
  if (s.training_now) parts.push(`${name}'s at the gym (while you train)`)
  if (s.workouts) {
    const tpl = session?.template_name
    if (s.workout_details && session) {
      const details = session.blocks
        .filter((b) => !b.skipped)
        .map((b) => {
          if (b.cardio) return `${b.exercise.name.toLowerCase()} ${num1(b.cardio.minutes)} min`
          const work = b.sets.filter((x) => x.done && !x.warmup)
          const kgs = work.map((x) => x.actual_kg ?? x.target_kg).filter((v): v is number => v != null)
          return work.length && kgs.length ? `${b.exercise.name.toLowerCase()} ${work.length} × ${num1(Math.max(...kgs))} kg` : null
        })
        .filter(Boolean)
        .slice(0, 3)
      parts.push(details.length ? `${name} finished ${tpl ?? "a workout"}: ${details.join(", ")}` : `${name} finished ${tpl ?? "a workout"}`)
    } else if (s.workout_details) {
      parts.push(`${name} finished a workout, with exercises, sets and weights`)
    } else {
      parts.push(tpl ? `${name} trained today: ${tpl}` : `${name} trained today`)
    }
  }
  if (s.records) {
    const r = data.record
    parts.push(r ? `New record: ${r.exercise_name.toLowerCase()} ${num1(r.kg)} kg × ${r.reps}` : "New personal records")
  }
  if (s.meals) parts.push(`${name} had chicken briyani for lunch (no calories)`)
  if (s.weight_trend) parts.push("Weight going up, down or steady, never the number")
  if (s.food_streaks) parts.push("Streak milestones, like 7 days in a row")
  if (s.weekly_summary) parts.push("How many days this week you were on target and hit protein")
  return parts.length ? `${parts.join(". ")}.` : "Nothing. Friends only see that you're on adebite."
}

export function SharingScreen() {
  const me = useMe()
  const name = displayName(me)
  const sharing = useApi<SharingResponse>("sharing")
  const prefs = useApi<NotificationPrefsResponse>("notification-prefs")
  const today = todayISO()
  const sessions = useApi<SessionsResponse>(`sessions?from=${addDays(today, -60)}&to=${today}`)
  const records = useApi<ProgressRecordsResponse>("progress/records")
  const lastSession = (sessions.data?.sessions ?? [])
    .filter((x) => x.status === "finished")
    .sort((a, b) => ((a.finished_at ?? a.date) < (b.finished_at ?? b.date) ? 1 : -1))[0]
  const lastRecord = [...(records.data?.records ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1))[0]
  const [asking, setAsking] = useState<Visibility | null>(null)
  const [applying, setApplying] = useState(false)

  async function save(patch: Partial<Sharing>, apply = false) {
    const prev = sharing.data?.sharing
    if (!prev) return
    let next = { ...prev, ...patch }
    // The numbers only make sense when workouts are shared.
    if (patch.workouts === false) next = { ...next, workout_details: false }
    if (patch.workout_details === true) next = { ...next, workouts: true }
    sharing.setData({ sharing: next })
    try {
      const res = await api.put<SharingPutResponse>("sharing", { ...next, apply_to_existing: apply })
      sharing.setData({ sharing: res.sharing })
      if (res.opened) {
        const n = res.opened.templates + res.opened.meals + res.opened.routines
        toast.success(n === 0 ? "Nothing was private. You're all set." : `Opened up ${n} thing${n === 1 ? "" : "s"}. Your crew can see them now.`)
      }
    } catch (err) {
      sharing.setData({ sharing: prev })
      toast.error(errorMessage(err))
    }
  }

  async function togglePref(key: keyof NotificationPrefs, value: boolean) {
    const prev = prefs.data?.prefs
    if (!prev) return
    const next = { ...prev, [key]: value }
    prefs.setData({ prefs: next })
    try {
      const res = await api.put<NotificationPrefsResponse>("notification-prefs", { [key]: value })
      prefs.setData(res)
    } catch (err) {
      prefs.setData({ prefs: prev })
      toast.error(errorMessage(err))
    }
  }

  function pickDefault(v: Visibility) {
    const cur = sharing.data?.sharing.default_visibility
    if (!cur || v === cur) return
    if (v === "private") void save({ default_visibility: v })
    else setAsking(v)
  }

  const s = sharing.data?.sharing
  const p = prefs.data?.prefs

  return (
    <div className="flex flex-col gap-3">
      <PageHeader back="/me" backLabel="Back to Me" eyebrow="Me" title="Sharing" />

      {sharing.error && !s ? (
        <ErrorCard message={sharing.error.message} onRetry={() => void sharing.reload()} />
      ) : !s ? (
        <Skeleton className="h-[420px] rounded-card" />
      ) : (
        <>
          {/* The big one: who sees your stuff by default */}
          <section aria-labelledby="default-title" className="flex flex-col gap-3 rounded-card bg-ink p-4 text-white">
            <div className="flex flex-col gap-1">
              <h2 id="default-title" className="m-0 text-[20px] font-black tracking-[-0.03em]">
                Share with your crew by default
              </h2>
              <p className="m-0 text-[13px] leading-[1.4] text-night-muted">
                New meals, workouts and routines start like this. You can still change each one with the button at the top of it.
              </p>
            </div>
            <div role="radiogroup" aria-labelledby="default-title" className="grid grid-cols-3 gap-1.5 rounded-[18px] bg-night-2 p-1.5">
              {DEFAULTS.map((d) => {
                const on = s.default_visibility === d.v
                return (
                  <button
                    key={d.v}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => pickDefault(d.v)}
                    className={cn(
                      "flex min-h-[76px] flex-col items-center justify-center gap-1 rounded-[13px] px-1 text-center transition-[background-color,color,transform] duration-200 ease-out active:scale-[0.97]",
                      on ? "bg-pink text-ink" : "text-night-muted hover:text-white"
                    )}
                  >
                    <VisibilityIcon visibility={d.v} size={20} />
                    <span className="text-[14px] font-extrabold">{d.title}</span>
                    <span className={cn("text-[11px] leading-[1.2]", on ? "text-ink-soft" : "text-night-dim")}>{d.sub}</span>
                  </button>
                )
              })}
            </div>
          </section>

          {GROUPS.map((g) => (
            <section key={g.title} aria-label={g.title} className="flex flex-col rounded-card bg-white px-3.5 pb-0.5 pt-3">
              <h2 className="m-0 flex items-center gap-2 text-[13px] font-bold text-muted">
                <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-pink-soft text-protein">{g.icon}</span>
                {g.title}
              </h2>
              {g.rows.map((r) => {
                const id = `share-${r.key}`
                return (
                  <div key={r.key} className="flex min-h-16 items-center gap-3 border-b border-line-soft last:border-b-0">
                    <div className="flex flex-1 flex-col gap-0.5 py-2.5">
                      <span id={id} className="text-[15px] font-bold">
                        {r.title}
                      </span>
                      <span className="text-[12px] leading-[1.35] text-muted">{r.sub}</span>
                    </div>
                    <Switch checked={s[r.key]} onChange={(v) => void save({ [r.key]: v })} labelledBy={id} />
                  </div>
                )
              })}
            </section>
          ))}

          <section aria-label="Preview" aria-live="polite" className="flex flex-col gap-1.5 rounded-card border-[1.5px] border-dashed border-dash px-3.5 py-3">
            <span className="text-[12px] font-semibold text-muted">Your friends would see</span>
            <span className="text-[14px] font-semibold leading-[1.45]">{previewSentence(s, name, { session: lastSession, record: lastRecord })}</span>
          </section>
        </>
      )}

      <section aria-label="Pings from friends" className="flex flex-col rounded-card bg-white px-3.5 pb-0.5 pt-3">
        <h2 className="m-0 flex items-center gap-2 text-[13px] font-bold text-muted">
          <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-pink-soft text-protein">
            <FireIcon size={18} />
          </span>
          Pings from friends
        </h2>
        {prefs.error && !p ? (
          <p className="m-0 py-3 text-[14px] text-danger">{prefs.error.message}</p>
        ) : !p ? (
          <Skeleton className="my-3 h-40" />
        ) : (
          (
            [
              ["friend_training", "They hit the gym", "So you can train together"],
              ["friend_workouts", "They finish a workout", "You can mute someone on their profile"],
              ["friend_shares", "They share something", "A workout, a meal or a routine"],
              ["friend_goals", "They smash their target", "And you've still got food to eat"],
              ["cheers", "Cheers on your stuff", "When a friend taps Cheer"],
            ] as const
          ).map(([key, title, sub]) => (
            <div key={key} className="flex min-h-[60px] items-center gap-3 border-b border-line-soft last:border-b-0">
              <div className="flex flex-1 flex-col gap-0.5 py-2">
                <span id={`n-${key}`} className="text-[15px] font-bold">
                  {title}
                </span>
                <span className="text-[12px] text-muted">{sub}</span>
              </div>
              <Switch checked={p[key]} onChange={(v) => togglePref(key, v)} labelledBy={`n-${key}`} />
            </div>
          ))
        )}
      </section>

      <Sheet
        open={asking !== null}
        onClose={() => setAsking(null)}
        title={asking === "public" ? "Share with everyone?" : "Share with your crew?"}
        description={
          asking === "public"
            ? "New stuff goes in the Shop with your name. Want the stuff that's private now out there too?"
            : "New stuff starts friends-only. Want your friends to see the stuff that's private now too?"
        }
      >
        <div className="flex flex-col gap-2">
          <Button
            loading={applying}
            onClick={async () => {
              if (!asking) return
              setApplying(true)
              await save({ default_visibility: asking }, true)
              setApplying(false)
              setAsking(null)
            }}
          >
            Yes, everything
          </Button>
          <Button
            variant="outline"
            disabled={applying}
            onClick={() => {
              if (asking) void save({ default_visibility: asking })
              setAsking(null)
            }}
          >
            Only new stuff
          </Button>
          <p className="m-0 text-[12px] text-muted">Public stays public. You can still make any one thing private again.</p>
        </div>
      </Sheet>
    </div>
  )
}
