import type { SessionBlock, SessionSet } from "@/lib/api/types"
import { cardioText } from "@/lib/cardio"
import { num1 } from "@/lib/format"

export { cardioText }

export function blockDone(b: SessionBlock): boolean {
  if (b.skipped) return true
  if (b.cardio) return b.cardio_done
  return b.sets.length > 0 && b.sets.every((s) => s.done)
}

/** "2 × 7, 12 kg", "2 sets, 45 kg" or "Set weight on first use". */
export function blockSummary(b: SessionBlock): { text: string; warn: boolean } {
  if (b.cardio) return { text: cardioText(b.cardio_actual ?? b.cardio), warn: false }
  const work = b.sets.filter((s) => !s.warmup)
  if (work.length === 0) return { text: `${b.sets.length} warm-up`, warn: false }
  const kgs = work.map((s) => s.target_kg)
  if (kgs.every((k) => k == null)) return { text: "Set weight on first use", warn: true }
  const top = Math.max(...kgs.filter((k): k is number => k != null))
  const reps = work.map((s) => (s.to_failure ? null : s.target_reps))
  const sameReps = reps.every((r) => r != null && r === reps[0])
  return {
    text: sameReps ? `${work.length} × ${reps[0]}, ${num1(top)} kg` : `${work.length} set${work.length === 1 ? "" : "s"}, ${num1(top)} kg`,
    warn: false,
  }
}

/** "1 warm-up, then 2 sets to failure" */
export function blockPlanText(b: SessionBlock): string {
  if (b.cardio) return cardioText(b.cardio)
  const warm = b.sets.filter((s) => s.warmup).length
  const work = b.sets.filter((s) => !s.warmup)
  const failure = work.length > 0 && work.every((s) => s.to_failure)
  const workText =
    work.length === 0
      ? ""
      : failure
        ? `${work.length} set${work.length === 1 ? "" : "s"} to failure`
        : `${work.length} working set${work.length === 1 ? "" : "s"}`
  if (warm && workText) return `${warm} warm-up, then ${workText}`
  if (warm) return `${warm} warm-up`
  return workText || "No sets"
}

export function ordinal(n: number): string {
  const words = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth"]
  return words[n - 1] ?? `${n}th`
}

/** Planned column on the review card: "35 kg, failure" / "12 kg × 7". */
export function plannedText(s: SessionSet): string {
  const kg = s.target_kg != null ? `${num1(s.target_kg)} kg` : "No weight"
  if (s.warmup && s.target_reps == null) return kg
  if (s.to_failure) return `${kg}, failure`
  return s.target_reps != null ? `${kg} × ${s.target_reps}` : kg
}

export function doneText(s: SessionSet): string {
  if (!s.done) return "Not done"
  const kg = s.actual_kg ?? s.target_kg
  const reps = s.actual_reps ?? s.target_reps
  if (kg == null && reps == null) return "Done"
  if (kg == null) return `${reps} reps`
  return reps != null ? `${num1(kg)} kg × ${reps}` : `${num1(kg)} kg`
}
