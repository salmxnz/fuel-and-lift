"use client"

import { useState } from "react"
import { Sheet } from "@/components/ui/sheet"
import { Button } from "@/components/ui/primitives"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "@/components/ui/icons"
import type { SessionBlock } from "@/lib/api/types"
import { cn } from "@/lib/cn"
import { ExerciseIcon } from "./exercise-icon"
import { blockDone } from "./session-helpers"

/** Today's exercises in a new order: up and down buttons, saved together. */
export function ReorderSheet({
  open,
  onClose,
  blocks,
  onSave,
}: {
  open: boolean
  onClose: () => void
  blocks: SessionBlock[]
  onSave: (ids: string[]) => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Reorder today" description="Only today's workout changes, not the template.">
      {open ? (
        <ReorderBody
          blocks={blocks}
          onSave={(ids) => {
            onSave(ids)
            onClose()
          }}
        />
      ) : null}
    </Sheet>
  )
}

function ReorderBody({ blocks, onSave }: { blocks: SessionBlock[]; onSave: (ids: string[]) => void }) {
  const byId = new Map(blocks.map((b) => [b.id, b]))
  const [ids, setIds] = useState(() => [...blocks].sort((a, b) => a.position - b.position).map((b) => b.id))
  const start = ids.map((id) => blocks.find((b) => b.id === id)!.position)
  const changed = ids.some((id, i) => byId.get(id)!.position !== [...start].sort((a, b) => a - b)[i])

  function move(i: number, by: -1 | 1) {
    const j = i + by
    if (j < 0 || j >= ids.length) return
    setIds((prev) => {
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <ol className="m-0 flex list-none flex-col rounded-card bg-white px-3 py-1">
        {ids.map((id, i) => {
          const b = byId.get(id)!
          const done = blockDone(b)
          return (
            <li key={id} className={cn("flex min-h-[60px] items-center gap-2.5 border-b border-line-soft last:border-b-0", (done || b.skipped) && "opacity-55")}>
              <span className="w-5 flex-none text-center text-[13px] font-bold text-muted">{i + 1}</span>
              <ExerciseIcon exercise={b.exercise} size={40} className="rounded-[10px]" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-bold">{b.exercise.name}</span>
                <span className="text-[12px] text-muted">{b.skipped ? "Skipped today" : done ? "Done" : (b.exercise.muscles[0] ?? b.exercise.muscle_group ?? "")}</span>
              </span>
              {done ? <CheckIcon size={16} className="flex-none text-protein" /> : null}
              <button
                type="button"
                aria-label={`Move ${b.exercise.name} up`}
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className="flex h-11 w-10 flex-none items-center justify-center rounded-[10px] disabled:opacity-30"
              >
                <ChevronUpIcon size={18} />
              </button>
              <button
                type="button"
                aria-label={`Move ${b.exercise.name} down`}
                onClick={() => move(i, 1)}
                disabled={i === ids.length - 1}
                className="flex h-11 w-10 flex-none items-center justify-center rounded-[10px] disabled:opacity-30"
              >
                <ChevronDownIcon size={18} />
              </button>
            </li>
          )
        })}
      </ol>
      <Button onClick={() => onSave(ids)} disabled={!changed}>
        Save order
      </Button>
    </div>
  )
}
