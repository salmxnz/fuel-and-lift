"use client"

import { useState } from "react"
import { MinusIcon, PlusIcon } from "@/components/ui/icons"
import { parseDecimal } from "@/lib/format"

/**
 * "3 sets × 12 reps @ 40 kg → Add": several identical working sets in one go
 * instead of adding and typing each one.
 */
export function QuickAddSets({
  defaultReps,
  defaultKg,
  remaining,
  onAdd,
  busy,
}: {
  defaultReps: string
  defaultKg: string
  /** How many more sets the block can take (the API allows 12). */
  remaining: number
  onAdd: (count: number, reps: number | null, kg: number | null) => void | Promise<void>
  busy?: boolean
}) {
  const [count, setCount] = useState(3)
  const [reps, setReps] = useState(defaultReps || "10")
  const [kg, setKg] = useState(defaultKg)
  const n = Math.min(count, Math.max(remaining, 0))

  if (remaining <= 0) {
    return <p className="m-0 text-[12px] text-muted">That&apos;s 12 sets, the most one exercise can have.</p>
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-[12px] bg-field p-1.5 text-[14px]">
      <span className="sr-only">Quick add sets</span>
      <div className="flex items-center rounded-[10px] bg-white">
        <button
          type="button"
          aria-label="Fewer sets"
          disabled={n <= 1}
          onClick={() => setCount(Math.max(1, n - 1))}
          className="flex h-9 w-8 items-center justify-center text-muted transition-transform duration-150 active:scale-[0.97] disabled:opacity-30"
        >
          <MinusIcon size={14} />
        </button>
        <span aria-live="polite" className="min-w-[1.5ch] text-center font-extrabold tabular-nums">
          {n}
        </span>
        <button
          type="button"
          aria-label="More sets"
          disabled={n >= remaining}
          onClick={() => setCount(Math.min(remaining, n + 1))}
          className="flex h-9 w-8 items-center justify-center text-muted transition-transform duration-150 active:scale-[0.97] disabled:opacity-30"
        >
          <PlusIcon size={14} />
        </button>
      </div>
      <span className="text-muted">sets ×</span>
      <input
        inputMode="numeric"
        aria-label="Reps per set"
        value={reps}
        onChange={(e) => setReps(e.target.value)}
        placeholder="reps"
        className="h-9 w-12 rounded-[10px] border border-line bg-white px-2 text-center font-bold"
      />
      <span className="text-muted">@</span>
      <input
        inputMode="decimal"
        aria-label="Kilograms per set"
        value={kg}
        onChange={(e) => setKg(e.target.value)}
        placeholder="kg"
        className="h-9 w-14 rounded-[10px] border border-line bg-white px-2 text-center font-bold"
      />
      <button
        type="button"
        disabled={busy || n < 1}
        onClick={() => void onAdd(n, parseDecimal(reps), parseDecimal(kg))}
        className="ml-auto flex h-9 items-center gap-1 rounded-[10px] bg-ink px-3 text-[13px] font-bold text-white transition-transform duration-150 active:scale-[0.97] disabled:opacity-50"
      >
        <PlusIcon size={14} /> Add {n}
      </button>
    </div>
  )
}
