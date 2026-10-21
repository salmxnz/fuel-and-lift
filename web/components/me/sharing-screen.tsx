"use client"

import { toast } from "sonner"
import { displayName, useMe } from "@/components/me-context"
import { ErrorCard, PageHeader, Skeleton, Switch } from "@/components/ui/primitives"
import { api, errorMessage } from "@/lib/api/client"
import type {
  NotificationPrefs,
  NotificationPrefsResponse,
  PersonalRecord,
  ProgressRecordsResponse,
  Session,
  SessionsResponse,
  Sharing,
  SharingResponse,
} from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { addDays, todayISO } from "@/lib/dates"
import { num1 } from "@/lib/format"

const ROWS: { key: keyof Sharing; title: string; sub: string }[] = [
  { key: "workouts", title: "Workouts", sub: "That you worked out today, and which template" },
  { key: "workout_details", title: "Workout details", sub: "Exercises, sets and weights" },
  { key: "records", title: "Personal records", sub: "New best lifts" },
  { key: "weight_trend", title: "Weight trend", sub: "Direction and milestones, never the number" },
  { key: "food_streaks", title: "Food streaks", sub: "Days in a row hitting protein or calories" },
]

type PreviewData = { session?: Session; record?: PersonalRecord }

/**
 * What friends would see, as one sentence (Sharing.dc.html), built from your
 * latest finished workout and record when you have them.
 */
export function previewSentence(s: Sharing, name: string, data: PreviewData): string {
  const parts: string[] = []
  const session = data.session
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
      parts.push(tpl ? `${name} worked out today: ${tpl}` : `${name} worked out today`)
    }
  }
  if (s.records) {
    const r = data.record
    parts.push(r ? `New record: ${r.exercise_name.toLowerCase()} ${num1(r.kg)} kg × ${r.reps}` : "New personal records")
  }
  if (s.weight_trend) parts.push("Weight is trending up or down, never the number")
  if (s.food_streaks) parts.push("Streaks like hitting protein a few days in a row")
  return parts.length ? `${parts.join(". ")}.` : "Nothing. Friends only see that you are on Fuel & Lift."
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

  async function toggleShare(key: keyof Sharing, value: boolean) {
    const prev = sharing.data?.sharing
    if (!prev) return
    let next = { ...prev, [key]: value }
    // Details only make sense when workouts are shared.
    if (key === "workouts" && !value) next = { ...next, workout_details: false }
    if (key === "workout_details" && value) next = { ...next, workouts: true }
    sharing.setData({ sharing: next })
    try {
      const res = await api.put<SharingResponse>("sharing", next)
      sharing.setData(res)
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
      const res = await api.put<NotificationPrefsResponse>("notification-prefs", next)
      prefs.setData(res)
    } catch (err) {
      prefs.setData({ prefs: prev })
      toast.error(errorMessage(err))
    }
  }

  const s = sharing.data?.sharing
  const p = prefs.data?.prefs

  return (
    <div className="flex flex-col gap-3">
      <PageHeader back="/me" backLabel="Back to Me" eyebrow="Me" title="Sharing" />
      <p className="m-0 text-[14px] leading-[1.45] text-muted">
        Choose what your friends see. Switching something off also hides what you shared before.
      </p>

      {sharing.error && !s ? (
        <ErrorCard message={sharing.error.message} onRetry={() => void sharing.reload()} />
      ) : !s ? (
        <Skeleton className="h-[320px] rounded-card" />
      ) : (
        <>
          <section aria-label="What friends see" className="flex flex-col rounded-card bg-white px-3.5 py-0.5">
            {ROWS.map((r) => {
              const id = `share-${r.key}`
              return (
                <div key={r.key} className="flex min-h-16 items-center gap-3 border-b border-line-soft last:border-b-0">
                  <div className="flex flex-1 flex-col gap-0.5 py-2">
                    <span id={id} className="text-[15px] font-bold">
                      {r.title}
                    </span>
                    <span className="text-[12px] leading-[1.35] text-muted">{r.sub}</span>
                  </div>
                  <Switch checked={s[r.key]} onChange={(v) => toggleShare(r.key, v)} labelledBy={id} />
                </div>
              )
            })}
          </section>
          <section
            aria-label="Preview"
            aria-live="polite"
            className="flex flex-col gap-1.5 rounded-card border-[1.5px] border-dashed border-dash px-3.5 py-3"
          >
            <span className="text-[12px] font-semibold text-muted">Your friends would see</span>
            <span className="text-[14px] font-semibold">{previewSentence(s, name, { session: lastSession, record: lastRecord })}</span>
          </section>
        </>
      )}

      <section aria-label="Notifications from friends" className="flex flex-col rounded-card bg-white px-3.5 py-0.5">
        {prefs.error && !p ? (
          <p className="m-0 py-3 text-[14px] text-danger">{prefs.error.message}</p>
        ) : !p ? (
          <Skeleton className="my-3 h-24" />
        ) : (
          <>
            <div className="flex min-h-[60px] items-center gap-3 border-b border-line-soft">
              <div className="flex flex-1 flex-col gap-0.5 py-2">
                <span id="n-workouts" className="text-[15px] font-bold">
                  When friends work out
                </span>
                <span className="text-[12px] text-muted">Push notification, per friend in Friends</span>
              </div>
              <Switch checked={p.friend_workouts} onChange={(v) => togglePref("friend_workouts", v)} labelledBy="n-workouts" />
            </div>
            <div className="flex min-h-[60px] items-center gap-3">
              <div className="flex flex-1 flex-col gap-0.5 py-2">
                <span id="n-cheers" className="text-[15px] font-bold">
                  Cheers on your workouts
                </span>
                <span className="text-[12px] text-muted">When a friend taps Cheer</span>
              </div>
              <Switch checked={p.cheers} onChange={(v) => togglePref("cheers", v)} labelledBy="n-cheers" />
            </div>
          </>
        )}
      </section>
    </div>
  )
}
