// Imports "Pixel Art food icon pack 32x32 (FREE)" by Darina Grant
// (https://darinagrant.itch.io/pixel-art-food-icon-pack-32x32) into
// public/food/<key>.png, using the keys in lib/food-icons.ts.
//
//   npm run food-icons -- ~/Downloads/food\ icon\ pack\ 32x32.zip
//
// The pack is free for commercial projects; it says nothing about
// redistributing it, so public/food stays out of git while the repository is
// public (see .gitignore).
import { execFileSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, extname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, "..", "public", "food")

// The pack's file name (without .png) for each key.
const FILES = {
  pizza: "Pizza",
  burger: "Hamburger",
  fries: "иконки", // the pack's fries file is just called "icons"
  hot_dog: "Hot dog",
  taco: "Taco",
  sandwich: "Sandwich",
  rice_bowl: "Bowl of rice",
  chicken: "Chicken",
  meat: "Meat",
  canned_fish: "Canned Fish",
  fried_egg: "Fried Egg",
  bread: "Bread",
  toast: "Bread slice",
  cheese: "Cheese",
  milk: "Milk",
  honey: "Honey",
  apple: "Applles",
  banana: "Bananas",
  watermelon: "Watermelon",
  bell_pepper: "Bell pepper",
  chili: "Chili pepper",
  cabbage: "Cabbage",
  mushroom: "Mushrooms",
  chips: "Chips",
  popcorn: "Popcorn",
  donut: "Donut",
  cupcake: "Cupcake",
  pie: "Cherry Pie",
  sweet: "Wrapped Sweet",
  lollipop: "Lollipop",
  candy_cane: "Candy canes",
  coffee: "Coffee mug",
  soda: "Soda Can",
  beer: "Beer",
  salt: "Salt",
}

const src = process.argv[2]
if (!src || !existsSync(src)) {
  console.error("Usage: npm run food-icons -- <path to the pack's zip or extracted folder>")
  process.exit(1)
}

let root = src
if (statSync(src).isFile()) {
  root = mkdtempSync(join(tmpdir(), "food-pack-"))
  // ditto keeps the pack's UTF-8 names intact on macOS; unzip elsewhere.
  if (process.platform === "darwin") execFileSync("ditto", ["-x", "-k", src, root])
  else execFileSync("unzip", ["-q", "-o", src, "-d", root])
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name)
    return d.isDirectory() ? walk(p) : [p]
  })
}

const norm = (s) => s.normalize("NFC").toLowerCase().trim()
const pngs = new Map(
  walk(root)
    .filter((f) => extname(f).toLowerCase() === ".png" && !norm(basename(f)).startsWith("icon pack"))
    .map((f) => [norm(basename(f, extname(f))), f])
)

mkdirSync(out, { recursive: true })
const missing = []
const used = new Set()
const unmatched = []
for (const [key, name] of Object.entries(FILES)) {
  const file = pngs.get(norm(name))
  if (file) {
    used.add(file)
    copyFileSync(file, join(out, `${key}.png`))
  } else unmatched.push(key)
}
// The fries file's Cyrillic name doesn't survive every unzip: when exactly one
// key and one file are left over, they belong together.
const leftover = [...pngs.values()].filter((f) => !used.has(f))
if (unmatched.length === 1 && leftover.length === 1) {
  copyFileSync(leftover[0], join(out, `${unmatched[0]}.png`))
} else {
  for (const key of unmatched) missing.push(`${key} (${FILES[key]}.png)`)
}
writeFileSync(
  join(out, "LICENSE.txt"),
  `Food icons: "Pixel Art food icon pack 32x32 (FREE)" by Darina Grant
https://darinagrant.itch.io/pixel-art-food-icon-pack-32x32
"You can use and edit these icons for commercial games and projects!"
Keep these files out of the public repository (redistribution isn't covered).
`
)
console.log(`Copied ${Object.keys(FILES).length - missing.length} icons to public/food`)
if (missing.length) {
  console.warn(`Not in the pack (the app falls back to a line icon): ${missing.join(", ")}`)
  process.exitCode = 1
}
