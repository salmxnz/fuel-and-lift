"use client"

import type { Visibility } from "@/lib/api/types"
import { cn } from "@/lib/utils"

export type VisibilityChoice = "all" | Visibility | "hidden"

const CHOICES: { value: VisibilityChoice; label: string }[] = [
  { value: "all", label: "All" },
  { value: "private", label: "Private" },
  { value: "friends", label: "Friends" },
  { value: "public", label: "Public" },
  { value: "hidden", label: "Hidden" },
]

export function matchesVisibility(item: { visibility: Visibility; hidden: boolean }, choice: VisibilityChoice): boolean {
  if (choice === "all") return true
  if (choice === "hidden") return item.hidden
  return item.visibility === choice
}

/** Filter chips with a count on each. */
export function VisibilityFilter({
  items,
  value,
  onChange,
}: {
  items: { visibility: Visibility; hidden: boolean }[]
  value: VisibilityChoice
  onChange: (v: VisibilityChoice) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Filter by visibility">
      {CHOICES.map((c) => {
        const n = items.filter((i) => matchesVisibility(i, c.value)).length
        if (c.value === "hidden" && n === 0) return null
        const active = value === c.value
        return (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(c.value)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
              active ? "border-foreground bg-foreground text-background" : "bg-background text-muted-foreground hover:text-foreground"
            )}
          >
            {c.label}
            <span className={cn("tabular-nums", active ? "text-background/70" : "text-muted-foreground/70")}>{n}</span>
          </button>
        )
      })}
    </div>
  )
}
