// Draws the Fuel & Lift app icons as SVG and rasterises them with sharp.
// Run with `npm run icons`; the PNGs in public/icons are committed.
import { mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, "..", "public", "icons")

const INK = "#171A12"
const LIME = "#C8F04D"
const GROUND = "#ECEEE7"

// The mark: a lime dumbbell over a lime bowl curve on ink. Drawn on a 100x100
// canvas; `scale` shrinks it toward the centre (maskable icons need it inside
// the 80% safe zone).
function mark(scale) {
  const t = (50 * (1 - scale)).toFixed(2)
  return `
  <g transform="translate(${t} ${t}) scale(${scale})" fill="none" stroke="${LIME}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M27 30v22M18 35.5v11M73 30v22M82 35.5v11M27 41h46" stroke-width="7"/>
    <path d="M22 60h56a28 28 0 0 1-56 0Z" stroke-width="6" fill="${LIME}" fill-opacity="0.18"/>
  </g>`
}

function svg({ radius, scale, background = INK }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="${radius}" fill="${background}"/>
  ${mark(scale)}
</svg>`
}

async function render(name, size, opts) {
  const file = join(out, name)
  await sharp(Buffer.from(svg(opts)), { density: Math.max(72, (size / 100) * 72) })
    .resize(size, size)
    .flatten(opts.flatten ? { background: GROUND } : false)
    .png({ compressionLevel: 9 })
    .toFile(file)
  console.log("wrote", file)
}

await mkdir(out, { recursive: true })
// "any" icons: rounded square on transparent.
await render("icon-192.png", 192, { radius: 22, scale: 0.86 })
await render("icon-512.png", 512, { radius: 22, scale: 0.86 })
// Maskable: full-bleed ink, mark inside the safe zone.
await render("icon-maskable-512.png", 512, { radius: 0, scale: 0.66 })
// iOS applies its own mask and dislikes transparency: full-bleed, opaque.
await render("apple-touch-icon.png", 180, { radius: 0, scale: 0.8, flatten: true })
// Favicon-size PNG for browsers that want one.
await render("favicon-32.png", 32, { radius: 22, scale: 0.9 })
