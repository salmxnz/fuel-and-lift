"use client"

import { useState } from "react"
import { toast } from "sonner"
import type { Day, DayMeal, Entry, EntryDayResponse, EntryItem, SavedMeal } from "@/lib/api/types"
import { api, errorMessage, seg } from "@/lib/api/client"
import { timeHM } from "@/lib/dates"
import { kcal } from "@/lib/format"
import { cn } from "@/lib/cn"
import { FoodIconTile } from "@/components/food/food-icon"
import { iconFor } from "@/lib/food-icons"
import type { FoodSheetTarget } from "@/components/food/add-food-sheet"
import { Avatar } from "@/components/ui/primitives"
import { shareSummary } from "@/components/share/friend-picker"

const ORIGIN_NOTE: Partial<Record<Entry["origin"], string>> = {
  ai: "From a photo or description, checked by you",
  restaurant: "From a restaurant menu",
  barcode: "Scanned barcode",
}

export function MealList({
  day,
  isPastDay,
  savedMeals,
  onAdd,
  onEdit,
  onDayChange,
}: {
  day: Day
  isPastDay: boolean
  savedMeals: SavedMeal[] | undefined
  onAdd: (target: FoodSheetTarget) => void
  onEdit: (entry: Entry) => void
  onDayChange: (day: Day) => void
}) {
  const firstEmpty = day.meals.findIndex((m) => m.entries.length === 0)

  return (
    <>
      {day.meals.map((meal, i) => {
        const key = meal.meal_slot_id ?? `oneoff-${meal.name}-${i}`
        const target: FoodSheetTarget = meal.meal_slot_id
          ? { mealSlotId: meal.meal_slot_id, label: meal.name }
          : { mealName: meal.name, label: meal.name }
        if (meal.entries.length === 0) {
          if (i === firstEmpty && !isPastDay) {
            const rest = day.meals.slice(i).filter((m) => m.entries.length === 0).map((m) => m.name.toLowerCase())
            return (
              <section
                key={key}
                aria-label={meal.name}
                className="flex items-center justify-between gap-3 rounded-card border-[1.5px] border-dashed border-dash p-4"
              >
                <div className="flex min-w-0 flex-col gap-[3px]">
                  <h2 className="m-0 text-[13px] font-semibold text-muted">{meal.name}</h2>
                  <span className="text-[15px]">
                    {day.remaining_kcal > 0
                      ? `${kcal(day.remaining_kcal)} kcal left for ${joinAnd(rest)}`
                      : "You've reached today's target"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onAdd(target)}
                  className="flex min-h-[44px] flex-none items-center rounded-[12px] bg-ink px-3.5 text-[14px] font-semibold text-white transition-transform duration-[160ms] ease-out active:scale-[0.97]"
                >
                  Log {meal.name.toLowerCase()}
                </button>
              </section>
            )
          }
          return (
            <section key={key} aria-label={meal.name} className="rounded-card bg-white">
              <button
                type="button"
                onClick={() => onAdd(target)}
                className="flex w-full flex-col gap-1.5 rounded-card px-4 py-3.5 text-left transition-transform duration-[160ms] ease-out active:scale-[0.98]"
              >
                <h2 className="m-0 text-[13px] font-semibold text-muted">{meal.name}</h2>
                <span className="text-[15px]">
                  Nothing yet <span className="sr-only">. Add food to {meal.name}</span>
                </span>
              </button>
            </section>
          )
        }
        return (
          <MealCard
            key={key}
            meal={meal}
            savedMeals={savedMeals}
            onAdd={() => onAdd(target)}
            onEdit={onEdit}
            onDayChange={onDayChange}
          />
        )
      })}
    </>
  )
}

function joinAnd(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "the rest of the day"
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

function MealCard({
  meal,
  savedMeals,
  onAdd,
  onEdit,
  onDayChange,
}: {
  meal: DayMeal
  savedMeals: SavedMeal[] | undefined
  onAdd: () => void
  onEdit: (entry: Entry) => void
  onDayChange: (day: Day) => void
}) {
  const single = meal.entries.length === 1
  const first = meal.entries[0]
  return (
    <section aria-label={meal.name} className="flex flex-col gap-2.5 rounded-card bg-white px-4 py-3.5">
      <div className="flex items-baseline justify-between">
        <h2 className="m-0 text-[13px] font-semibold text-muted">{meal.name}</h2>
        <span className="text-[13px] text-muted">
          {single ? timeHM(first.logged_at) : `${kcal(meal.totals.kcal)} kcal`}
        </span>
      </div>
      {meal.entries.map((entry, idx) => (
        <div key={entry.id} className={cn("flex flex-col gap-2.5", idx > 0 && "border-t border-line-soft pt-2.5")}>
          <EntryRow entry={entry} onEdit={() => onEdit(entry)} />
          {entry.saved_meal_id ? (
            <AddonChips entry={entry} saved={savedMeals?.find((s) => s.id === entry.saved_meal_id)} onDayChange={onDayChange} />
          ) : null}
        </div>
      ))}
      <button
        type="button"
        onClick={onAdd}
        className="-mb-1.5 flex min-h-[40px] items-center self-start text-[13px] font-semibold text-protein transition-transform duration-[160ms] ease-out active:scale-[0.97]"
      >
        + Add to {meal.name.toLowerCase()}
      </button>
    </section>
  )
}

function EntryRow({ entry, onEdit }: { entry: Entry; onEdit: () => void }) {
  const note = ORIGIN_NOTE[entry.origin]
  const icon = iconFor(entry)
  // Logged from a photo, menu or barcode, or with a picture: shown on a tile,
  // with kcal on the right.
  const visual = entry.origin === "ai" || entry.origin === "restaurant" || entry.origin === "barcode"
  const tile = visual || icon != null
  const description = entry.items
    .map((it) => it.name)
    .filter(Boolean)
    .join(", ")
  const shared = shareSummary(entry)
  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label={`${entry.name}, ${kcal(entry.kcal)} kcal${shared ? `. ${shared}` : ""}. Edit`}
      className="flex w-full items-center gap-3 text-left transition-transform duration-[160ms] ease-out active:scale-[0.98]"
    >
      {tile ? <FoodIconTile icon={icon} origin={entry.origin} /> : null}
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-[17px] font-bold">{entry.name}</span>
          {!tile ? (
            <span className="flex-none text-[17px] font-bold">
              {kcal(entry.kcal)} <span className="text-[13px] font-normal text-muted">kcal</span>
            </span>
          ) : null}
        </span>
        {visual && note ? (
          <span className="text-[13px] font-semibold text-protein">{note}</span>
        ) : description && description !== entry.name ? (
          <span className="line-clamp-2 text-[13px] leading-[1.4] text-muted">{description}</span>
        ) : null}
        {shared ? <SharedLine entry={entry} text={shared} /> : null}
      </span>
      {tile ? (
        <span className="flex-none text-[17px] font-bold">
          {kcal(entry.kcal)} <span className="text-[13px] font-normal text-muted">kcal</span>
        </span>
      ) : null}
    </button>
  )
}

/** Small overlapping faces of who a meal went to, then the summary line. */
function SharedLine({ entry, text }: { entry: Entry; text: string }) {
  const faces = entry.shared_with.slice(0, 3)
  return (
    <span aria-hidden="true" className="mt-0.5 flex min-w-0 items-start gap-1.5">
      <span className="flex flex-none pt-px">
        {faces.map((f, i) => (
          <Avatar key={f.id} name={f.name} url={f.avatar_url} size={18} tone="pink" className={cn("ring-2 ring-white", i > 0 && "-ml-1.5")} />
        ))}
      </span>
      <span className="line-clamp-2 text-[13px] leading-[1.4] text-muted">{text}</span>
    </span>
  )
}

/** Chips for a saved meal's add-ons: pink when included, dashed "+ name" when not. */
function AddonChips({
  entry,
  saved,
  onDayChange,
}: {
  entry: Entry
  saved: SavedMeal | undefined
  onDayChange: (day: Day) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const addons = saved?.items.filter((i) => i.is_addon) ?? []
  if (addons.length === 0) return null

  async function toggle(addonId: string) {
    const addon = addons.find((a) => a.id === addonId)
    if (!addon) return
    const idx = entry.items.findIndex((it) => it.name === addon.name)
    let items: EntryItem[]
    if (idx >= 0) {
      items = entry.items.filter((_, i) => i !== idx)
    } else {
      const { id: _id, is_addon: _a, ...item } = addon
      void _id
      void _a
      items = [...entry.items, item]
    }
    setBusy(addonId)
    try {
      const res = await api.patch<EntryDayResponse>(`entries/${seg(entry.id)}`, { items })
      onDayChange(res.day)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Add-ons">
      {addons.map((a) => {
        const on = entry.items.some((it) => it.name === a.name)
        const label = a.grams ? `${a.name} ${Math.round(a.grams)} g` : a.name
        return (
          <button
            key={a.id}
            type="button"
            aria-pressed={on}
            disabled={busy !== null}
            aria-busy={busy === a.id || undefined}
            onClick={() => toggle(a.id)}
            className={cn(
              "relative min-h-[32px] rounded-full px-3 text-[13px] text-ink disabled:opacity-60",
              "before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-['']",
              on ? "border border-ink bg-pink font-semibold" : "border border-dashed border-dash bg-transparent"
            )}
          >
            {on ? label : `+ ${label}`}
          </button>
        )
      })}
    </div>
  )
}
