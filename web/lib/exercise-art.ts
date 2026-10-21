import type { Exercise } from "@/lib/api/types"

// Pixel icons from "Free Pixel Gym & Fitness Icons 32x32" by reodesuxz
// (itch.io; free for personal and commercial use, no redistribution of the
// pack). `npm run pixel-icons <zip>` copies them to public/pixel/<key>.png
// under these stable names; see scripts/import-pixel-pack.mjs.

export const ART_KEYS = [
  "dumbbell",
  "barbell",
  "kettlebell",
  "plate",
  "bench",
  "machine",
  "cable",
  "pullup",
  "mat",
  "treadmill",
  "bike",
  "rower",
  "stairs",
  "rope",
  "sneakers",
  "stopwatch",
  "gloves",
] as const
export type ArtKey = (typeof ART_KEYS)[number]

export const REWARD_KEYS = ["fire", "trophy", "medal_gold", "medal_silver", "medal_bronze", "star"] as const
export type RewardKey = (typeof REWARD_KEYS)[number]

/** Strong name signals win over equipment (a "Smith machine squat" is still a machine). */
const BY_NAME: [RegExp, ArtKey][] = [
  [/stair|step ?mill/i, "stairs"],
  [/treadmill|incline walk/i, "treadmill"],
  [/bike|cycl|spin/i, "bike"],
  [/rowing machine|\brower\b|ski ?erg/i, "rower"],
  [/jump rope|skipping|battle rope/i, "rope"],
  [/kettlebell|\bkb\b/i, "kettlebell"],
  [/pull-?up|chin-?up/i, "pullup"],
  [/bench press|incline (bench|dumbbell) press|decline bench/i, "bench"],
  [/plank|crunch|dead bug|russian twist|leg raise|mountain climb|burpee|glute bridge|push-?up|ab wheel|nordic/i, "mat"],
]

/** Last resort for user-made exercises with no equipment. */
const BY_NAME_WEAK: [RegExp, ArtKey][] = [
  [/cable|pushdown|pulldown|face pull/i, "cable"],
  [/machine|pec deck|leg press|extension|leg curl/i, "machine"],
  [/dumbbell|curl|raise|fly|lunge/i, "dumbbell"],
  [/deadlift|squat|row|barbell|press|shrug/i, "barbell"],
  [/\b(run|jog|walk|hike)/i, "sneakers"],
  [/box|sled|swim|elliptical|boxing/i, "stopwatch"],
]

/** Then the equipment field. */
const BY_EQUIPMENT: Record<string, ArtKey> = {
  dumbbell: "dumbbell",
  barbell: "barbell",
  "ez bar": "barbell",
  "trap bar": "barbell",
  "t-bar": "barbell",
  "smith machine": "machine",
  machine: "machine",
  "cable machine": "cable",
  kettlebell: "kettlebell",
  bodyweight: "mat",
  "ab wheel": "mat",
  treadmill: "treadmill",
  bike: "bike",
  rower: "rower",
  "stair climber": "stairs",
  "jump rope": "rope",
  "battle ropes": "rope",
  running: "sneakers",
  walking: "sneakers",
}

/** The pixel icon for an exercise: strong name signals, equipment, weak name guesses, kind. */
export function artFor(ex: Pick<Exercise, "name" | "equipment" | "kind">): ArtKey {
  for (const [re, key] of BY_NAME) if (re.test(ex.name)) return key
  const eq = ex.equipment?.toLowerCase().trim()
  if (eq && BY_EQUIPMENT[eq]) return BY_EQUIPMENT[eq]
  for (const [re, key] of BY_NAME_WEAK) if (re.test(ex.name)) return key
  return ex.kind === "cardio" ? "stopwatch" : "dumbbell"
}

export const pixelSrc = (key: ArtKey | RewardKey) => `/pixel/${key}.png`
