// Draws the adebite app icons (white bitten "a" on pastel pink) and rasterises
// them with sharp. Run with `npm run icons`; the PNGs in public/icons are
// committed. The mark comes from docs/brand/logo/adebite-symbol-white.svg.
import { mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, "..", "public", "icons")

const PINK = "#F6B8CA"
const WHITE = "#FFFFFF"

// The bitten "a", drawn on a 256x256 canvas.
const SYMBOL =
  "M123.85 38.1A28 28 0 0 1 86.13 63.93A28 28 0 0 1 48.07 89.23A88 88 0 0 0 168 204.38L168 212L216 212L216 40L168 40L168 47.62A88 88 0 0 0 123.85 38.1ZM167.95 127.96A40 40 0 1 1 88.05 124.04A40 40 0 1 1 167.95 127.96Z"

// `scale` is the share of the icon the 256 canvas takes up; maskable icons
// need the mark inside the 80% safe zone.
function svg({ radius, scale }) {
  const s = (scale * 1024) / 256
  const t = 512 - 128 * s
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="${radius * 1024}" fill="${PINK}"/>
  <path fill="${WHITE}" fill-rule="evenodd" transform="translate(${t} ${t}) scale(${s})" d="${SYMBOL}"/>
</svg>`
}

async function render(name, size, opts) {
  const file = join(out, name)
  await sharp(Buffer.from(svg(opts)), { density: Math.max(72, (size / 1024) * 72) })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(file)
  console.log("wrote", file)
}

await mkdir(out, { recursive: true })
// "any" icons: rounded square on transparent.
await render("icon-192.png", 192, { radius: 0.2237, scale: 0.68 })
await render("icon-512.png", 512, { radius: 0.2237, scale: 0.68 })
// Maskable: full-bleed pink, mark inside the safe zone.
await render("icon-maskable-512.png", 512, { radius: 0, scale: 0.56 })
// iOS applies its own mask and dislikes transparency: full-bleed, opaque.
await render("apple-touch-icon.png", 180, { radius: 0, scale: 0.68 })
// Favicon-size PNG for browsers that want one: the mark a little larger.
await render("favicon-32.png", 32, { radius: 0.2237, scale: 0.8 })
