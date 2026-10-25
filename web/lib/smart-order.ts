import type { SessionBlock } from "@/lib/api/types"

// "The machine's taken": do something else now and come back to it. The
// exercise to do instead is the one that least gets in the way: it works a
// different muscle than the busy one (so that one isn't tired when you get
// back to it) and than the one you just did, is close to where it was in the
// plan, and leaves cardio for the end. The busy one goes right after it.

function main(b: SessionBlock): string {
  return b.exercise.muscles[0] ?? b.exercise.muscle_group ?? b.exercise.name
}

function isDone(b: SessionBlock): boolean {
  if (b.cardio) return b.cardio_done
  return b.sets.length > 0 && b.sets.every((s) => s.done)
}

/**
 * The new order (every block id) after putting `busyId` off, and the block
 * to do now; null when there's nothing else left to do.
 */
export function doLater(blocks: SessionBlock[], busyId: string): { order: string[]; next: SessionBlock } | null {
  const sorted = [...blocks].sort((a, b) => a.position - b.position)
  const busyAt = sorted.findIndex((b) => b.id === busyId)
  if (busyAt < 0) return null
  const busy = sorted[busyAt]
  const lastDone = [...sorted].reverse().find((b) => !b.skipped && isDone(b) && b.sets.some((s) => s.done))
  const open = sorted.filter((b) => b.id !== busyId && !b.skipped && !isDone(b))
  if (open.length === 0) return null
  const strengthLeft = open.some((b) => !b.cardio)

  let next = open[0]
  let best = -Infinity
  for (const b of open) {
    const at = sorted.indexOf(b)
    let score = -0.5 * Math.abs(at - busyAt)
    if (main(b) !== main(busy)) score += 3
    if (!lastDone || main(b) !== main(lastDone)) score += 2
    if (b.cardio && strengthLeft) score -= 4
    if (score > best) {
      best = score
      next = b
    }
  }

  const rest = sorted.filter((b) => b.id !== busy.id && b.id !== next.id)
  rest.splice(Math.min(busyAt, rest.length), 0, next, busy)
  return { order: rest.map((b) => b.id), next }
}

/** Move one block up or down among all blocks; returns the new id order. */
export function moveBlock(blocks: SessionBlock[], id: string, by: -1 | 1): string[] {
  const ids = [...blocks].sort((a, b) => a.position - b.position).map((b) => b.id)
  const i = ids.indexOf(id)
  const j = i + by
  if (i < 0 || j < 0 || j >= ids.length) return ids
  ;[ids[i], ids[j]] = [ids[j], ids[i]]
  return ids
}
