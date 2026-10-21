import type { MealSlot } from "./api/types"
import { isISODate, todayISO } from "./dates"

/** Where a new food entry goes: a meal slot, or a one-off meal by name. */
export type MealTarget = {
  date: string
  mealSlotId: string | null
  mealName: string | null
  /** Display name ("Lunch", "Late snack"). */
  label: string
}

export function targetQuery(t: MealTarget): string {
  const p = new URLSearchParams()
  p.set("date", t.date)
  if (t.mealSlotId) p.set("slot", t.mealSlotId)
  else if (t.mealName) p.set("meal", t.mealName)
  if (t.label) p.set("label", t.label)
  return p.toString()
}

export function targetFromParams(params: URLSearchParams): MealTarget {
  const date = params.get("date")
  const slot = params.get("slot")
  const meal = params.get("meal")?.trim().slice(0, 60) || null
  const label = params.get("label")?.trim().slice(0, 60) || meal || "Meal"
  return {
    date: isISODate(date) ? date : todayISO(),
    mealSlotId: slot && /^[A-Za-z0-9-]{1,64}$/.test(slot) ? slot : null,
    mealName: slot ? null : meal,
    label,
  }
}

/** API body fields for an entry's meal. */
export function targetBody(t: MealTarget): { meal_slot_id?: string; meal_name?: string } {
  if (t.mealSlotId) return { meal_slot_id: t.mealSlotId }
  return { meal_name: t.mealName || t.label || "Meal" }
}

/** Pick the meal that fits the time of day: breakfast in the morning etc. */
export function slotForNow(slots: MealSlot[], now = new Date()): MealSlot | null {
  if (slots.length === 0) return null
  const sorted = [...slots].sort((a, b) => a.position - b.position)
  const h = now.getHours() + now.getMinutes() / 60
  const want =
    h < 10.5 ? /breakfast|morning/i : h < 15 ? /lunch|midday/i : h < 17.5 ? /snack|afternoon|pre-?workout/i : h < 22 ? /dinner|supper|evening/i : /snack|late/i
  const named = sorted.find((s) => want.test(s.name))
  if (named) return named
  // Fall back on position: spread the day over the list.
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(((h - 6) / 16) * sorted.length)))
  return sorted[idx]
}
