import type { Cardio, Exercise } from "@/lib/api/types"
import { num1 } from "@/lib/format"

// Not every cardio machine has an incline and a speed: a treadmill does, a
// bike has a resistance level, a rower or a run has a distance. These decide
// which fields the template editor and the workout show.

export type CardioField = "incline" | "speed" | "level" | "distance_km"

export const CARDIO_FIELD_LABEL: Record<CardioField | "minutes" | "kcal", string> = {
  minutes: "Minutes",
  incline: "Incline %",
  speed: "Speed km/h",
  level: "Level",
  distance_km: "Distance km",
  kcal: "kcal",
}

const BY_EQUIPMENT: Record<string, CardioField[]> = {
  treadmill: ["incline", "speed"],
  bike: ["level"],
  elliptical: ["level"],
  "stair climber": ["level"],
  rower: ["distance_km"],
  "ski erg": ["distance_km"],
  running: ["distance_km"],
  walking: ["distance_km"],
  pool: ["distance_km"],
}

/** Name hints for user-made exercises without a known equipment. */
const BY_NAME: [RegExp, CardioField[]][] = [
  [/treadmill|incline walk/i, ["incline", "speed"]],
  [/bike|cycl|spin|elliptical|cross ?trainer|stair|step ?mill/i, ["level"]],
  [/row|erg|\brun\b|jog|walk|swim|hike/i, ["distance_km"]],
]

/** The optional fields that apply to a cardio exercise (minutes always do). */
export function cardioFields(ex: Pick<Exercise, "name" | "equipment">): CardioField[] {
  const eq = ex.equipment?.toLowerCase().trim()
  if (eq && BY_EQUIPMENT[eq]) return BY_EQUIPMENT[eq]
  for (const [re, fields] of BY_NAME) if (re.test(ex.name)) return fields
  return []
}

/** "20 min, incline 6, speed 6" — only the values that are set. */
export function cardioText(c: Cardio): string {
  const parts = [`${num1(c.minutes)} min`]
  if (c.distance_km != null) parts.push(`${num1(c.distance_km)} km`)
  if (c.incline != null) parts.push(`incline ${num1(c.incline)}`)
  if (c.speed != null) parts.push(`speed ${num1(c.speed)}`)
  if (c.level != null) parts.push(`level ${num1(c.level)}`)
  if (c.kcal != null) parts.push(`${Math.round(c.kcal)} kcal`)
  return parts.join(", ")
}

/** Drop the fields a machine doesn't have (an old template's speed on a rower). */
export function onlyFields(c: Cardio, fields: CardioField[]): Cardio {
  return {
    minutes: c.minutes,
    incline: fields.includes("incline") ? c.incline : null,
    speed: fields.includes("speed") ? c.speed : null,
    level: fields.includes("level") ? (c.level ?? null) : null,
    distance_km: fields.includes("distance_km") ? (c.distance_km ?? null) : null,
  }
}
