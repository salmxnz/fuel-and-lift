"use client"

import { useRouter } from "next/navigation"
import { useState, useSyncExternalStore } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/primitives"
import { CloseIcon, TargetIcon } from "@/components/ui/icons"
import { useQueryClient } from "@tanstack/react-query"
import { api, errorMessage, seg } from "@/lib/api/client"
import type { GymInsightsResponse, Nudge, PlannedSet, WeekExtrasResponse } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { startOfWeek, todayISO, weekdayName } from "@/lib/dates"
import { num1 } from "@/lib/format"
import { ExerciseIcon } from "./exercise-icon"
import { addExercise, startWorkout } from "./offline-session"

// "You haven't trained forearms in 2 weeks": the muscles the API says need
// work, with a couple of exercises for each. They go into the next workout
// this week (this week only), or start right away. Dismissed ones stay hidden
// until next week.

const DISMISS_KEY = "fl:nudges-dismissed"

function dismissed(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "{}") as { week?: string; muscles?: string[] }
    return raw.week === startOfWeek(todayISO()) ? (raw.muscles ?? []) : []
  } catch {
    return []
  }
}

const listeners = new Set<() => void>()
function dismiss(muscle: string) {
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify({ week: startOfWeek(todayISO()), muscles: [...dismissed(), muscle] }))
  } catch {
    /* private mode */
  }
  listeners.forEach((l) => l())
}

function useDismissed(): string {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => dismissed().join(","),
    () => ""
  )
}

/** Three working sets at the last weight used, 12 reps (accessory work). */
function setsFor(lastKg: number | null): PlannedSet[] {
  return Array.from({ length: 3 }, () => ({ warmup: false, target_kg: lastKg, target_reps: 12, to_failure: false }))
}

function dayLabel(date: string): string {
  return date === todayISO() ? "today" : weekdayName(date)
}

export function MuscleNudges({ activeSessionId }: { activeSessionId: string | null }) {
  const router = useRouter()
  const client = useQueryClient()
  const insights = useApi<GymInsightsResponse>("gym/insights")
  const hidden = useDismissed().split(",")
  const [busy, setBusy] = useState<string | null>(null)
  const nudges = (insights.data?.nudges ?? []).filter((n) => !hidden.includes(n.muscle))
  const extras = insights.data?.extras ?? []

  async function addToWeek(n: Nudge) {
    if (!n.add_to) return
    setBusy(`week-${n.muscle}`)
    try {
      const res = await api.post<WeekExtrasResponse>("gym/week-extras", {
        template_id: n.add_to.template_id,
        date: n.add_to.date,
        blocks: n.exercises.map((x) => ({ exercise_id: x.exercise.id, sets: setsFor(x.last_kg) })),
      })
      insights.setData((prev) => ({
        muscles: prev?.muscles ?? [],
        nudges: (prev?.nudges ?? []).filter((x) => x.muscle !== n.muscle),
        extras: res.extras,
      }))
      toast.success(`Added to ${n.add_to.name} ${dayLabel(n.add_to.date)}, this week only`)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  /** Into the workout in progress, or a new one now. */
  async function startNow(n: Nudge) {
    setBusy(`now-${n.muscle}`)
    try {
      const id = activeSessionId ?? (await startWorkout(client, todayISO(), null))
      for (const x of n.exercises) await addExercise(id, x.exercise, setsFor(x.last_kg))
      router.push(`/gym/session/${id}`)
    } catch (err) {
      toast.error(errorMessage(err))
      setBusy(null)
    }
  }

  async function undo(extraId: string) {
    try {
      await api.del(`gym/week-extras/${seg(extraId)}`)
      void insights.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  if (nudges.length === 0 && extras.length === 0) return null

  return (
    <section aria-labelledby="nudges-title" className="flex flex-col gap-2.5 rounded-card bg-white p-3.5">
      <h2 id="nudges-title" className="m-0 flex items-center gap-1.5 text-[13px] font-semibold text-muted">
        <TargetIcon size={16} /> Needs some work
      </h2>

      {nudges.map((n) => (
        <div key={n.muscle} className="flex flex-col gap-2.5 border-b border-line-soft pb-3 last:border-b-0 last:pb-0">
          <div className="flex items-start justify-between gap-2">
            <p className="m-0 text-[17px] font-extrabold leading-snug tracking-[-0.01em]">{n.text}</p>
            <button
              type="button"
              aria-label={`Hide the ${n.muscle} suggestion this week`}
              onClick={() => dismiss(n.muscle)}
              className="-mr-2 -mt-1.5 flex h-11 w-11 flex-none items-center justify-center rounded-full text-muted"
            >
              <CloseIcon size={18} />
            </button>
          </div>
          <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0">
            {n.exercises.map((x) => (
              <li key={x.exercise.id} className="flex flex-col gap-1.5">
                <ExerciseIcon exercise={x.exercise} size={88} wide className="rounded-tile" />
                <span className="text-[14px] font-bold leading-tight">{x.exercise.name}</span>
                <span className="text-[12px] text-muted">3 × 12{x.last_kg != null ? `, ${num1(x.last_kg)} kg last time` : ""}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            {n.add_to && !activeSessionId ? (
              <Button size="sm" onClick={() => void addToWeek(n)} loading={busy === `week-${n.muscle}`} disabled={busy !== null}>
                Add to {n.add_to.name}, {dayLabel(n.add_to.date)}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant={n.add_to && !activeSessionId ? "outline" : "primary"}
              onClick={() => void startNow(n)}
              loading={busy === `now-${n.muscle}`}
              disabled={busy !== null}
            >
              {activeSessionId ? "Add to this workout" : "Do it now"}
            </Button>
          </div>
        </div>
      ))}

      {extras.length > 0 ? (
        <ul aria-label="Added this week" className="m-0 flex list-none flex-col gap-1 p-0">
          {extras.map((x) => (
            <li key={x.id} className="flex min-h-[40px] items-center justify-between gap-2 text-[13px]">
              <span className="min-w-0 truncate">
                <span className="font-semibold">{x.exercise.name}</span>
                <span className="text-muted"> · in {x.template_name} this week</span>
              </span>
              <button type="button" onClick={() => void undo(x.id)} className="min-h-9 flex-none px-2 font-semibold underline">
                Undo
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
