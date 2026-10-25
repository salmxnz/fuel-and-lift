"use client"

// Today's nudge: ideas for the next meal you haven't logged yet (what you had
// last time, your usual, what fills today's protein gap, what your crew ate).
// Only on today, and only while there's room left in the day.

import type { Day, MealSlot } from "@/lib/api/types"
import { MealSuggestions } from "@/components/food/suggestions"
import { kcal } from "@/lib/format"
import { slotForNow, targetQuery } from "@/lib/meal-target"

export function EatNext({
  day,
  slots,
  onLogged,
}: {
  day: Day
  slots: MealSlot[]
  onLogged: (day: Day) => void
}) {
  if (day.remaining_kcal < 150 || slots.length === 0) return null
  const empty = new Set(day.meals.filter((m) => m.entries.length === 0 && m.meal_slot_id).map((m) => m.meal_slot_id as string))
  const open = slots.filter((s) => empty.has(s.id))
  // The meal that fits the time of day, if it's still open; else the next open one.
  const now = slotForNow(slots)
  const slot = now && empty.has(now.id) ? now : (open.find((s) => !now || s.position > now.position) ?? null)
  if (!slot) return null
  const q = targetQuery({ date: day.date, mealSlotId: slot.id, mealName: null, label: slot.name })
  return (
    <MealSuggestions
      key={`${slot.id}-${day.date}`}
      date={day.date}
      slotId={slot.id}
      mealLabel={slot.name}
      describeHref={(text) => `/log/describe?${q}&text=${encodeURIComponent(text)}`}
      onLogged={onLogged}
      onNavigate={() => {}}
      title={
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="m-0 text-[18px] font-black tracking-[-0.035em]">{slot.name} ideas</h2>
          <span className="flex-none text-[13px] text-muted">{kcal(day.remaining_kcal)} kcal to play with</span>
        </div>
      }
    />
  )
}
