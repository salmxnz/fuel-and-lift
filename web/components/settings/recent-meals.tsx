"use client"

// What you've logged in the last three days, one per name, newest first.
// On Saved meals each can be saved in a tap; when picking a meal to log
// ("My meals"), each logs again in a tap, so yesterday's dinner is one tap away.

import { useState } from "react"
import { toast } from "sonner"
import { FoodIconTile } from "@/components/food/food-icon"
import { Skeleton } from "@/components/ui/primitives"
import { api, errorMessage, seg } from "@/lib/api/client"
import { logAgain } from "@/components/food/offline-log"
import type { DayResponse, Entry, SavedMeal, SaveEntryResponse } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { addDays, relativeDay, todayISO } from "@/lib/dates"
import { iconFor } from "@/lib/food-icons"
import { kcal } from "@/lib/format"
import { targetBody, type MealTarget } from "@/lib/meal-target"

export function RecentMeals({
  mode,
  target,
  savedNames,
  onSaved,
  onLogged,
}: {
  mode: "save" | "log"
  /** Where a logged meal goes (log mode). */
  target?: MealTarget
  /** Names already in saved meals (lower case): not offered for saving again. */
  savedNames: Set<string>
  onSaved?: (m: SavedMeal) => void
  onLogged?: () => void
}) {
  const today = todayISO()
  const d0 = useApi<DayResponse>(`days/${today}`)
  const d1 = useApi<DayResponse>(`days/${addDays(today, -1)}`)
  const d2 = useApi<DayResponse>(`days/${addDays(today, -2)}`)
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<Set<string>>(new Set())

  const loading = !d0.data && !d1.data && !d2.data && (d0.loading || d1.loading || d2.loading)
  const seen = new Set<string>()
  const list: Entry[] = []
  for (const d of [d0, d1, d2]) {
    const entries = (d.data?.day.meals ?? []).flatMap((m) => m.entries).sort((a, b) => (a.logged_at < b.logged_at ? 1 : -1))
    for (const e of entries) {
      const k = e.name.trim().toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      if (mode === "save" && (e.saved_meal_id || savedNames.has(k))) continue
      // Logging today's meal again into today is rarely what's meant.
      if (mode === "log" && target && e.date === target.date) continue
      list.push(e)
    }
  }
  const shown = list.filter((e) => !done.has(e.id)).slice(0, 6)

  async function act(e: Entry) {
    setBusy(e.id)
    try {
      if (mode === "save") {
        const res = await api.post<SaveEntryResponse>(`entries/${seg(e.id)}/save`, {})
        toast.success(`${res.saved_meal.name} saved. One tap next time.`)
        setDone((s) => new Set(s).add(e.id))
        onSaved?.(res.saved_meal)
      } else if (target) {
        await logAgain({ date: target.date, label: target.label, source: e, target: targetBody(target) })
        toast.success(`${e.name}, logged to ${target.label}. Easy.`)
        onLogged?.()
      }
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <Skeleton className="h-[120px] rounded-card" />
  if (shown.length === 0) return null
  return (
    <section aria-labelledby="recent-title" className="flex flex-col gap-2">
      <h2 id="recent-title" className="m-0 text-[13px] font-semibold text-muted">
        {mode === "save" ? "Recently logged, not saved yet" : "Recently logged"}
      </h2>
      <ul className="m-0 flex list-none flex-col rounded-card bg-white px-3.5 py-1">
        {shown.map((e) => (
          <li key={e.id} className="flex min-h-[64px] items-center gap-3 border-b border-line-soft py-2 last:border-b-0">
            <FoodIconTile icon={iconFor(e)} origin={e.origin} size={44} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[15px] font-bold">{e.name}</span>
              <span className="truncate text-[12.5px] text-muted">
                {relativeDay(`${e.date}T12:00:00`).split(",")[0]} · {e.meal_name} · {kcal(e.kcal)} kcal
              </span>
            </span>
            <button
              type="button"
              onClick={() => void act(e)}
              disabled={busy !== null}
              aria-busy={busy === e.id || undefined}
              aria-label={`${mode === "save" ? "Save" : "Log"} ${e.name}`}
              className="flex min-h-10 flex-none items-center rounded-[12px] bg-ink px-3.5 text-[14px] font-bold text-white transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-60"
            >
              {busy === e.id ? "…" : mode === "save" ? "Save" : "Log"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
