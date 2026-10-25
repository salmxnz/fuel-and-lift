"use client"

// Pick a meal's category: one chip at a time, tap the chosen one again to clear it.

import type { MealCategory } from "@/lib/api/types"
import { cn } from "@/lib/cn"
import { MEAL_CATEGORIES } from "@/lib/meal-categories"

export function CategoryChips({
  value,
  onChange,
  label = "Category",
  wrap = true,
}: {
  value: MealCategory | null
  onChange: (c: MealCategory | null) => void
  label?: string
  /** Wrap onto lines (forms) or scroll sideways (filters). */
  wrap?: boolean
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex gap-1.5", wrap ? "flex-wrap" : "no-scrollbar -mx-4 overflow-x-auto px-4")}>
      {MEAL_CATEGORIES.map((c) => {
        const on = value === c.key
        return (
          <button
            key={c.key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(on ? null : c.key)}
            className={cn(
              "flex min-h-[38px] flex-none items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[14px] font-semibold transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.96]",
              on ? "border-ink bg-ink text-white" : "border-line bg-white text-ink"
            )}
          >
            <span aria-hidden="true">{c.emoji}</span>
            {c.label}
          </button>
        )
      })}
    </div>
  )
}

/** A small read-only pill for a meal's category. */
export function CategoryPill({ category, className }: { category: MealCategory | null; className?: string }) {
  const c = MEAL_CATEGORIES.find((x) => x.key === category)
  if (!c) return null
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-pink-soft px-2 py-0.5 text-[12px] font-bold text-ink-soft", className)}>
      <span aria-hidden="true">{c.emoji}</span>
      {c.label}
    </span>
  )
}
