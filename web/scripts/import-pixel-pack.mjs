// Imports "Free Pixel Gym & Fitness Icons 32x32" by reodesuxz
// (https://reodesuxz.itch.io/free-pixel-gym-fitness-icons-32x32) into
// public/pixel/<key>.png, using the stable names in lib/exercise-art.ts.
//
//   npm run pixel-icons -- ~/Downloads/Pixel_Gym_Fitness_Icons_v1.0.zip
//
// The pack's licence allows commercial use but not redistributing the pack,
// so only commit public/pixel while the repository is private.
import { execFileSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, extname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, "..", "public", "pixel")

// Words in the pack's file names that identify each key, best first.
const SYNONYMS = {
  dumbbell: ["dumbbell"],
  barbell: ["barbell"],
  kettlebell: ["kettlebell"],
  plate: ["weight_plate", "plate"],
  bench: ["bench"],
  machine: ["leg_press", "machine", "smith"],
  cable: ["cable", "pulley"],
  pullup: ["pull_up", "pullup", "chin_up", "bar"],
  mat: ["yoga_mat", "mat"],
  treadmill: ["treadmill"],
  bike: ["exercise_bike", "bike", "bicycle", "cycle"],
  rower: ["rowing", "rower"],
  stairs: ["stair", "step"],
  rope: ["jump_rope", "skipping", "rope"],
  sneakers: ["sneaker", "shoe", "trainer"],
  stopwatch: ["stopwatch", "timer", "clock"],
  gloves: ["boxing_glove", "glove"],
  fire: ["fire", "flame", "streak", "burn"],
  trophy: ["trophy", "cup"],
  medal_gold: ["gold_medal", "medal_gold", "medal_1", "gold"],
  medal_silver: ["silver_medal", "medal_silver", "medal_2", "silver"],
  medal_bronze: ["bronze_medal", "medal_bronze", "medal_3", "bronze"],
  star: ["star"],
}

// When the pack has nothing for a key, borrow the closest one.
const FALLBACK = {
  plate: ["barbell", "dumbbell"],
  bench: ["barbell", "dumbbell"],
  machine: ["cable", "plate", "dumbbell"],
  cable: ["machine", "dumbbell"],
  pullup: ["mat", "dumbbell"],
  mat: ["sneakers", "dumbbell"],
  kettlebell: ["dumbbell"],
  barbell: ["plate", "dumbbell"],
  treadmill: ["sneakers", "stopwatch"],
  bike: ["stopwatch", "sneakers"],
  rower: ["stopwatch"],
  stairs: ["sneakers", "stopwatch"],
  rope: ["stopwatch"],
  sneakers: ["stopwatch"],
  gloves: ["stopwatch"],
  medal_gold: ["trophy", "star"],
  medal_silver: ["medal_gold", "trophy"],
  medal_bronze: ["medal_silver", "medal_gold", "trophy"],
  fire: ["star"],
  trophy: ["medal_gold", "star"],
}

const src = process.argv[2]
if (!src || !existsSync(src)) {
  console.error("Usage: npm run pixel-icons -- <path to Pixel_Gym_Fitness_Icons zip or extracted folder>")
  process.exit(1)
}

let root = src
if (statSync(src).isFile()) {
  root = mkdtempSync(join(tmpdir(), "pixel-pack-"))
  execFileSync("unzip", ["-q", "-o", src, "-d", root])
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name)
    return d.isDirectory() ? walk(p) : [p]
  })
}

/** PNG width from the IHDR chunk. */
function pngWidth(file) {
  const b = readFileSync(file)
  return b.length > 24 && b.toString("ascii", 1, 4) === "PNG" ? b.readUInt32BE(16) : 0
}

// Prefer the 128×128 (4x) renders; fall back to 32×32.
const pngs = walk(root).filter((f) => extname(f).toLowerCase() === ".png")
const icons = new Map() // normalised name → file
for (const f of pngs) {
  const w = pngWidth(f)
  if (w !== 128 && w !== 32) continue // skip the sprite sheet
  const name = basename(f, ".png")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_?(32|128|4x|x4|1x)(px)?_?/g, "_")
    .replace(/^_+|_+$/g, "")
  const prev = icons.get(name)
  if (!prev || (w === 128 && pngWidth(prev) !== 128)) icons.set(name, f)
}
if (icons.size === 0) {
  console.error(`No 32×32 or 128×128 PNGs found in ${src}`)
  process.exit(1)
}

const chosen = {}
const used = new Set()
for (const [key, words] of Object.entries(SYNONYMS)) {
  for (const w of words) {
    const hit = [...icons.keys()].find((n) => !used.has(n) && (n === w || n.split("_").includes(w) || n.includes(w)))
    if (hit) {
      chosen[key] = hit
      used.add(hit)
      break
    }
  }
}
for (const key of Object.keys(SYNONYMS)) {
  if (chosen[key]) continue
  const borrow = (FALLBACK[key] ?? []).find((k) => chosen[k])
  if (borrow) chosen[key] = chosen[borrow]
}

mkdirSync(out, { recursive: true })
for (const [key, name] of Object.entries(chosen)) copyFileSync(icons.get(name), join(out, `${key}.png`))
writeFileSync(
  join(out, "LICENSE.txt"),
  `Pixel icons: "Free Pixel Gym & Fitness Icons 32x32" by reodesuxz
https://reodesuxz.itch.io/free-pixel-gym-fitness-icons-32x32
"Free for personal and commercial projects, credit appreciated but not required.
No redistribution or resale of the pack itself."
Only commit these files while the repository is private.
`
)

console.log(`Pack icons (${icons.size}):\n  ${[...icons.keys()].sort().join(", ")}\n`)
for (const key of Object.keys(SYNONYMS)) {
  const n = chosen[key]
  console.log(`${key.padEnd(13)} ${n ? `← ${n}${used.has(n) && SYNONYMS[key].some((w) => n.includes(w)) ? "" : " (borrowed)"}` : "MISSING (app falls back to line art)"}`)
}
