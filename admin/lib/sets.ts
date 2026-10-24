import type { Cardio, PlannedSet } from "@/lib/api/types"

function one(s: PlannedSet): string {
  const reps = s.to_failure ? "AMRAP" : s.target_reps != null ? `${s.target_reps}` : "?"
  return s.target_kg != null ? `${reps} @ ${s.target_kg} kg` : `${reps} reps`
}

/** "2 warm-up · 3 × 8 @ 60 kg · 1 × AMRAP @ 50 kg": runs of equal sets folded. */
export function summarizeSets(sets: PlannedSet[]): string {
  const warmups = sets.filter((s) => s.warmup).length
  const parts: string[] = warmups ? [`${warmups} warm-up`] : []
  let last = ""
  let n = 0
  for (const s of sets.filter((x) => !x.warmup)) {
    const label = one(s)
    if (label === last) {
      n++
      continue
    }
    if (n) parts.push(`${n} × ${last}`)
    last = label
    n = 1
  }
  if (n) parts.push(`${n} × ${last}`)
  return parts.join(" · ") || "No sets"
}

export function summarizeCardio(c: Cardio): string {
  const extras = [c.incline != null ? `incline ${c.incline}` : null, c.speed != null ? `speed ${c.speed}` : null].filter(Boolean)
  return `${c.minutes} min${extras.length ? ` · ${extras.join(" · ")}` : ""}`
}
