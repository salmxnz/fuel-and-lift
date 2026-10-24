import type { Split, Weekday } from "@/lib/api/types"
import { WEEKDAY_KEYS } from "@/lib/dates"

/**
 * Which workout of a split lands on each training day: the rotation cycles
 * over the days in week order. Mirrors splits.Assign in the API, which has
 * the final say; this is only for previews.
 */
export function assignDays(split: Split, days: Weekday[]): Partial<Record<Weekday, string>> {
  const sorted = WEEKDAY_KEYS.filter((d) => days.includes(d))
  const out: Partial<Record<Weekday, string>> = {}
  sorted.forEach((d, i) => {
    const w = split.workouts[split.rotation[i % split.rotation.length]]
    if (w) out[d] = w.name
  })
  return out
}

/** "3 to 6 days", or "5 days" when it's fixed. */
export function dayRange(split: Split): string {
  return split.min_days === split.max_days ? `${split.min_days} days` : `${split.min_days} to ${split.max_days} days`
}
