"use client"

// The day's macros: what you've had, what's left, and (tap to open) which
// meal it came from. Bars fill with scaleX; a tick marks the target when
// you've gone past it.

import { AnimatePresence, motion } from "motion/react"
import { useState } from "react"
import type { Day } from "@/lib/api/types"
import { ChevronDownIcon } from "@/components/ui/icons"
import { cn } from "@/lib/cn"
import { kcal, num1 } from "@/lib/format"
import { EASE_OUT } from "@/lib/motion"

type Key = "protein_g" | "carbs_g" | "fat_g"
const MACROS: { key: Key; label: string; bar: string; dot: string; kcalPerG: number }[] = [
  { key: "protein_g", label: "Protein", bar: "bg-protein", dot: "bg-protein", kcalPerG: 4 },
  { key: "carbs_g", label: "Carbs", bar: "bg-carbs", dot: "bg-carbs", kcalPerG: 4 },
  { key: "fat_g", label: "Fat", bar: "bg-fat", dot: "bg-fat", kcalPerG: 9 },
]

export function MacroCard({ day }: { day: Day }) {
  const [open, setOpen] = useState(false)
  const meals = day.meals.filter((m) => m.entries.length > 0)
  const canOpen = meals.length > 0

  return (
    <section aria-label="Macros" className="rounded-card bg-white">
      <button
        type="button"
        disabled={!canOpen}
        aria-expanded={canOpen ? open : undefined}
        onClick={() => setOpen((o) => !o)}
        className="grid w-full grid-cols-3 gap-2.5 p-4 text-left transition-transform duration-150 ease-out enabled:active:scale-[0.99]"
      >
        {MACROS.map((m) => (
          <Macro key={m.key} label={m.label} value={day.totals[m.key]} target={day.target[m.key]} bar={m.bar} dot={m.dot} />
        ))}
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="split"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.26, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <ul className="m-0 flex list-none flex-col gap-3 border-t border-line-soft px-4 pb-4 pt-3.5">
              {meals.map((meal) => {
                const total = MACROS.reduce((s, m) => s + meal.totals[m.key] * m.kcalPerG, 0) || 1
                return (
                  <li key={meal.meal_slot_id ?? meal.name} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-2 text-[13px]">
                      <span className="font-bold text-ink">{meal.name}</span>
                      <span className="text-muted tabular-nums">
                        {num1(meal.totals.protein_g)}P · {num1(meal.totals.carbs_g)}C · {num1(meal.totals.fat_g)}F · {kcal(meal.totals.kcal)} kcal
                      </span>
                    </div>
                    {/* Where this meal's calories came from */}
                    <div className="flex h-2 gap-[2px] overflow-hidden rounded-full" aria-hidden="true">
                      {MACROS.map((m) => (
                        <span key={m.key} className={m.bar} style={{ flexGrow: (meal.totals[m.key] * m.kcalPerG) / total }} />
                      ))}
                    </div>
                  </li>
                )
              })}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {canOpen ? (
        <span className="sr-only">{open ? "Tap to hide the split by meal" : "Tap to see the split by meal"}</span>
      ) : null}
      {canOpen ? (
        <div aria-hidden="true" className="-mt-2 flex justify-center pb-1.5 text-muted">
          <ChevronDownIcon size={16} className={cn("transition-transform duration-200 ease-out", open && "rotate-180")} />
        </div>
      ) : null}
    </section>
  )
}

function Macro({ label, value, target, bar, dot }: { label: string; value: number; target: number; bar: string; dot: string }) {
  const share = target > 0 ? value / target : 0
  const diff = Math.round(target - value)
  const over = diff < 0
  // Past the target the bar is full and a tick shows where the target was.
  const tickAt = over ? Math.max(0, Math.min(1, target / value)) : null
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-muted">
        <span className={cn("h-2 w-2 flex-none rounded-full", dot)} />
        {label}
      </span>
      <span className="truncate text-[15px] font-extrabold tracking-[-0.02em] tabular-nums">
        {num1(value)}
        <span className="text-[12.5px] font-medium text-muted"> / {kcal(target)} g</span>
      </span>
      <div role="img" aria-label={`${label}: ${num1(value)} of ${kcal(target)} grams`} className="relative h-2 overflow-hidden rounded-full bg-line-soft">
        <div className={cn("h-full origin-left rounded-full transition-transform duration-500 ease-in-out", bar)} style={{ transform: `scaleX(${Math.min(1, share)})` }} />
        {tickAt !== null ? <span className="absolute inset-y-0 w-[2px] bg-white" style={{ left: `calc(${tickAt * 100}% - 1px)` }} /> : null}
      </div>
      <span className={cn("text-[12px] font-semibold tabular-nums", over ? "text-protein" : "text-muted")}>
        {over ? `${kcal(-diff)} g over` : diff === 0 ? "Bang on" : `${kcal(diff)} g left`}
      </span>
    </div>
  )
}
