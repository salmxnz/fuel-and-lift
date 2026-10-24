// Draws the email illustrations (heroes, icons, referral progress, logo) as SVG
// in the brand palette and rasterises them with sharp into web/public/email,
// where the web app serves them at ${APP_URL}/email/*.png. Everything is drawn
// at 2x (3x for the logo) for retina inboxes. Run: npm run assets
import { mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, "..", "..", "web", "public", "email")

// docs/brand/BRAND.md
const C = {
  blush: "#FBEFF3",
  pink: "#F6B8CA",
  pinkSoft: "#FBDCE6",
  pinkDeep: "#EC9DB5",
  carbs: "#EE8FB0",
  berry: "#E27399", // carbs, one step deeper, for shading
  rose: "#A82F61",
  peach: "#F2B48C",
  peachDeep: "#E89C70",
  sand: "#F6DCCB",
  lilac: "#EDE3F6",
  plum: "#2E1A24",
  plum2: "#452A37",
  plum3: "#553646",
  dash: "#C9A9B6",
  white: "#FFFFFF",
}

// The bitten "a" on its 256 grid (docs/brand/logo/adebite-symbol-*.svg).
const SYMBOL =
  "M123.85 38.1A28 28 0 0 1 86.13 63.93A28 28 0 0 1 48.07 89.23A88 88 0 0 0 168 204.38L168 212L216 212L216 40L168 40L168 47.62A88 88 0 0 0 123.85 38.1ZM167.95 127.96A40 40 0 1 1 88.05 124.04A40 40 0 1 1 167.95 127.96Z"
const WORDMARK =
  "M596.98 51.07A19 19 0 1 0 559.02 52.93A19 19 0 1 0 596.98 51.07ZM230 202.26L230 208L262 208L262 32L230 32L230 93.74A62 62 0 1 0 230 202.26ZM229.94 149.84A30 30 0 1 1 170.06 146.16A30 30 0 1 1 229.94 149.84ZM450 202.26A62 62 0 1 0 450 93.74L450 32L418 32L418 208L450 208L450 202.26ZM509.94 149.84A30 30 0 1 1 450.06 146.16A30 30 0 1 1 509.94 149.84ZM662 48L630 48L630 88L608 88L608 114L630 114L630 208L662 208L662 114L686 114L686 88L662 88L662 48ZM92 202.26L92 208L124 208L124 88L92 88L92 93.74A62 62 0 1 0 92 202.26ZM91.94 149.84A30 30 0 1 1 32.06 146.16A30 30 0 1 1 91.94 149.84ZM388.86 186.17L363.64 166.47A30 30 0 0 1 313.47 162L400.4 162A62 62 0 1 0 388.86 186.17ZM367.49 136L312.51 136A30 30 0 0 1 367.49 136ZM594 88L562 88L562 208L594 208L594 88ZM808.86 186.17L783.64 166.47A30 30 0 0 1 733.47 162L820.4 162A62 62 0 1 0 808.86 186.17ZM787.49 136L732.51 136A30 30 0 0 1 787.49 136Z"

/** The symbol centred on (cx, cy), `size` px tall. */
function symbol(cx, cy, size, fill) {
  const s = size / 174 // the mark spans y 38–212 on its grid
  return `<path fill="${fill}" fill-rule="evenodd" transform="translate(${cx - 132 * s} ${cy - 125 * s}) scale(${s})" d="${SYMBOL}"/>`
}

// --- shapes -------------------------------------------------------------------

const circle = (cx, cy, r, fill, extra = "") => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`

/** A four-point sparkle. */
function sparkle(cx, cy, r, fill = C.white, opacity = 1) {
  return `<path fill="${fill}" opacity="${opacity}" d="M${cx} ${cy - r}Q${cx} ${cy} ${cx + r} ${cy}Q${cx} ${cy} ${cx} ${cy + r}Q${cx} ${cy} ${cx - r} ${cy}Q${cx} ${cy} ${cx} ${cy - r}Z"/>`
}

/** Two rows of scalloped clouds that end in solid white at the bottom edge,
 *  so the hero runs straight into the white card below it. `base` is where
 *  each row turns solid; the bumps rise about 50 px above it. */
function clouds(w, h, backBase, frontBase, back = C.pinkSoft) {
  const row = (base, fill, rs, phase) => {
    let s = `<rect x="0" y="${base}" width="${w}" height="${h}" fill="${fill}"/>`
    let x = -phase
    let i = 0
    while (x < w + 80) {
      const r = rs[i % rs.length]
      s += circle(x + r, base + r * 0.3, r, fill)
      x += r * 1.6
      i++
    }
    return s
  }
  return row(backBase, back, [46, 62, 40, 70, 52, 44, 64], 40) + row(frontBase, C.white, [58, 42, 74, 48, 66, 44, 60], 12)
}

/** Hero canvas: 1120×600 with the card's 24 px (48 at 2x) top corners baked in. */
function hero(defs, body, bg) {
  const W = 1120
  const H = 600
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <clipPath id="card"><path d="M0 48A48 48 0 0 1 48 0H${W - 48}A48 48 0 0 1 ${W} 48V${H}H0Z"/></clipPath>
    ${defs}
  </defs>
  <g clip-path="url(#card)">
    <rect width="${W}" height="${H}" fill="${bg}"/>
    ${body}
  </g>
</svg>`
}

function friedEgg(x, y, rot = 0, s = 1) {
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
    ${circle(0, 0, 54, C.white)}${circle(26, -14, 40, C.white)}${circle(-24, 16, 40, C.white)}${circle(18, 24, 38, C.white)}${circle(-16, -22, 36, C.white)}
    ${circle(8, 4, 26, C.peach)}${circle(12, 9, 26, C.peachDeep, 'opacity="0.35"')}${circle(8, 4, 24, C.peach)}
    ${circle(0, -4, 7, C.white, 'opacity="0.85"')}
  </g>`
}

function dumbbell(x, y, rot = 0, s = 1, plate = C.plum, bar = C.rose) {
  const side = (m) => `
    <rect x="${m * 44 - (m < 0 ? 24 : 0)}" y="-38" width="24" height="76" rx="9" fill="${plate}"/>
    <rect x="${m * 70 - (m < 0 ? 18 : 0)}" y="-28" width="18" height="56" rx="7" fill="${plate}"/>`
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
    <rect x="-96" y="-8" width="192" height="16" rx="8" fill="${bar}"/>
    ${side(-1)}${side(1)}
    <rect x="-64" y="-30" width="5" height="40" rx="2.5" fill="${C.white}" opacity="0.22"/>
    <rect x="${44 + 5}" y="-30" width="5" height="40" rx="2.5" fill="${C.white}" opacity="0.22"/>
  </g>`
}

const STRAWBERRY = "M0 -42C36 -48 56 -22 48 10C40 42 14 64 0 70C-14 64 -40 42 -48 10C-56 -22 -36 -48 0 -42Z"

function strawberry(x, y, rot = 0, s = 1, face = false) {
  const seeds = [
    [-24, -14], [0, -18], [24, -14], [-32, 10], [-10, 6], [12, 6], [32, 10], [-20, 30], [2, 30], [22, 30], [-8, 50], [10, 50],
  ]
    .map(([sx, sy]) => `<ellipse cx="${sx}" cy="${sy}" rx="2.6" ry="4" fill="${C.white}" opacity="0.9"/>`)
    .join("")
  const leaves = [-110, -70, -30, 30, 70, 110]
    .map((a) => `<ellipse cx="0" cy="-54" rx="7" ry="14" fill="${C.rose}" transform="rotate(${a} 0 -42)"/>`)
    .join("")
  const faceSvg = face
    ? `<path d="M-24 2q9 9 18 0M6 2q9 9 18 0" stroke="${C.plum}" stroke-width="5" fill="none" stroke-linecap="round"/>
       <path d="M-10 18q10 10 20 0" stroke="${C.plum}" stroke-width="5" fill="none" stroke-linecap="round"/>
       <ellipse cx="-30" cy="18" rx="8" ry="5" fill="${C.white}" opacity="0.45"/><ellipse cx="30" cy="18" rx="8" ry="5" fill="${C.white}" opacity="0.45"/>`
    : seeds
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
    <path d="${STRAWBERRY}" fill="${C.carbs}"/>
    <path d="M0 70C-14 64 -40 42 -48 10C-50 0 -50 -8 -48 -16C-36 30 -10 56 18 62C10 67 4 69 0 70Z" fill="${C.berry}" opacity="0.6"/>
    ${faceSvg}
    ${leaves}${circle(0, -42, 7, C.rose)}
    <path d="M0 -44q2 -12 10 -18" stroke="${C.rose}" stroke-width="6" fill="none" stroke-linecap="round"/>
  </g>`
}

function donut(x, y, rot = 0, s = 1) {
  const ring = (r, h) => `M${-r} 0a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0ZM${-h} 0a${h} ${h} 0 1 1 ${2 * h} 0a${h} ${h} 0 1 1 ${-2 * h} 0Z`
  // Icing with a drippy edge: a ring of bumps around the hole.
  let icing = ""
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    icing += circle((44 * Math.cos(a)).toFixed(1), (44 * Math.sin(a)).toFixed(1), i % 2 ? 11 : 14, C.carbs)
  }
  const sprinkles = [
    [-30, -20, 30, C.white], [20, -34, -20, C.plum], [36, 4, 60, C.white], [-38, 14, -40, C.plum],
    [-6, -40, 80, C.white], [10, 38, 10, C.white], [-22, 34, 70, C.plum], [38, -22, 20, C.sand],
  ]
    .map(([sx, sy, a, f]) => `<rect x="${sx - 7}" y="${sy - 2.5}" width="14" height="5" rx="2.5" fill="${f}" transform="rotate(${a} ${sx} ${sy})"/>`)
    .join("")
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
    <path fill-rule="evenodd" d="${ring(62, 18)}" fill="${C.peach}"/>
    <path fill-rule="evenodd" d="${ring(62, 18)}" fill="${C.peachDeep}" opacity="0.35" transform="translate(0 6)"/>
    <path fill-rule="evenodd" d="${ring(60, 18)}" fill="${C.peach}"/>
    <g>${icing}</g>
    <path fill-rule="evenodd" d="${ring(48, 22)}" fill="${C.carbs}"/>
    ${circle(0, 0, 20, C.peachDeep)}${circle(0, 0, 17, "url(#holebg)")}
    ${sprinkles}
  </g>`
}

function peachFace(x, y, s = 1) {
  return `<g transform="translate(${x} ${y}) scale(${s})">
    ${circle(0, 0, 120, C.peach)}
    <path d="M-6 -118C-40 -70 -36 -10 -10 40" stroke="${C.peachDeep}" stroke-width="7" fill="none" stroke-linecap="round" opacity="0.55"/>
    <path d="M120 0A120 120 0 0 1 -60 104C20 110 96 70 112 -40C117 -26 120 -13 120 0Z" fill="${C.peachDeep}" opacity="0.3"/>
    <path d="M0 -116c10 -30 40 -46 74 -40c-12 28 -40 44 -74 40Z" fill="${C.rose}"/>
    <path d="M-44 -8q14 14 28 0M20 -8q14 14 28 0" stroke="${C.plum}" stroke-width="8" fill="none" stroke-linecap="round"/>
    <path d="M-18 26q20 20 40 0" stroke="${C.plum}" stroke-width="8" fill="none" stroke-linecap="round"/>
    <ellipse cx="-62" cy="22" rx="18" ry="11" fill="${C.carbs}" opacity="0.7"/><ellipse cx="66" cy="22" rx="18" ry="11" fill="${C.carbs}" opacity="0.7"/>
  </g>`
}

function heart(x, y, s, fill) {
  return `<path transform="translate(${x} ${y}) scale(${s})" fill="${fill}" d="M0 30C-30 10 -50 -6 -50 -26C-50 -42 -38 -54 -24 -54C-12 -54 -4 -48 0 -40C4 -48 12 -54 24 -54C38 -54 50 -42 50 -26C50 -6 30 10 0 30Z"/>`
}

// --- heroes -------------------------------------------------------------------

const skyDefs = (id, top, bottom) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="0.85" stop-color="${bottom}"/></linearGradient>`

function welcomeHero() {
  const defs = `${skyDefs("sky", C.blush, C.pink)}
    <radialGradient id="glow" cx="0.5" cy="0.82" r="0.5"><stop offset="0" stop-color="${C.white}" stop-opacity="0.75"/><stop offset="1" stop-color="${C.white}" stop-opacity="0"/></radialGradient>
    <radialGradient id="holebg" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${C.pink}"/><stop offset="1" stop-color="${C.pink}"/></radialGradient>`
  const body = `
    <rect width="1120" height="600" fill="url(#sky)"/>
    <rect width="1120" height="600" fill="url(#glow)"/>
    <circle cx="560" cy="470" r="282" fill="none" stroke="${C.white}" stroke-width="3" stroke-dasharray="2 14" stroke-linecap="round" opacity="0.9"/>
    <circle cx="560" cy="470" r="236" fill="${C.white}" opacity="0.4"/>
    <circle cx="560" cy="470" r="200" fill="${C.white}"/>
    ${symbol(560, 378, 128, C.pink)}
    ${friedEgg(200, 170, -14, 1.05)}
    ${dumbbell(930, 150, 24, 0.95)}
    ${strawberry(190, 392, -16, 1.15)}
    ${donut(930, 384, 12, 1)}
    ${sparkle(330, 90, 18)}${sparkle(780, 70, 12)}${sparkle(1040, 250, 16)}${sparkle(80, 290, 12)}${sparkle(700, 210, 9, C.white, 0.8)}${sparkle(400, 230, 10, C.white, 0.8)}
    ${circle(470, 130, 6, C.white, 'opacity="0.8"')}${circle(1000, 60, 5, C.white, 'opacity="0.8"')}${circle(60, 120, 6, C.white, 'opacity="0.7"')}${circle(820, 300, 5, C.white, 'opacity="0.8"')}
    ${clouds(1120, 600, 528, 556)}`
  return hero(defs, body, C.blush)
}

function friendHero() {
  const defs = skyDefs("sky", C.blush, C.pinkSoft)
  const confetti = [
    [150, 120, C.carbs, 30], [260, 70, C.peach, -20], [330, 170, C.rose, 50], [800, 90, C.carbs, -40], [900, 170, C.peach, 15],
    [990, 90, C.rose, 70], [90, 250, C.peach, 40], [1030, 280, C.carbs, -10], [690, 60, C.lilac, 30], [430, 60, C.lilac, -30],
  ]
    .map(([x, y, f, a]) => `<rect x="${x - 10}" y="${y - 5}" width="20" height="10" rx="5" fill="${f}" transform="rotate(${a} ${x} ${y})"/>`)
    .join("")
  const body = `
    <rect width="1120" height="600" fill="url(#sky)"/>
    ${circle(560, 520, 330, C.white, 'opacity="0.55"')}
    ${confetti}
    ${heart(560, 150, 1.1, C.rose)}${heart(484, 108, 0.42, C.carbs)}${heart(640, 96, 0.34, C.pink)}
    ${sparkle(250, 330, 14, C.white)}${sparkle(880, 330, 16, C.white)}${sparkle(700, 190, 10, C.white)}${sparkle(410, 200, 10, C.white)}
    ${peachFace(410, 400, 1)}
    ${strawberry(712, 392, 6, 2.5, true)}
    ${clouds(1120, 600, 528, 556, C.pink)}`
  return hero(defs, body, C.blush)
}

function proHero() {
  const defs = `${skyDefs("sky", C.plum, C.plum2)}
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${C.pink}" stop-opacity="0.45"/><stop offset="1" stop-color="${C.pink}" stop-opacity="0"/></radialGradient>`
  let scallops = ""
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2
    scallops += circle((560 + 118 * Math.cos(a)).toFixed(1), (260 + 118 * Math.sin(a)).toFixed(1), 30, C.pink)
  }
  let friends = ""
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2 + Math.PI / 8
    const x = 560 + 300 * Math.cos(a)
    const y = 260 + 186 * Math.sin(a)
    friends += circle(x.toFixed(1), y.toFixed(1), 22, C.pinkSoft) + symbol(x, y, 22, C.rose)
  }
  const stars = [
    [120, 90, 14, 1], [240, 200, 8, 0.7], [980, 110, 16, 1], [900, 230, 9, 0.6], [80, 330, 10, 0.6], [1050, 330, 12, 0.8],
    [330, 60, 7, 0.6], [770, 50, 9, 0.7], [180, 420, 7, 0.5], [960, 420, 8, 0.5],
  ]
    .map(([x, y, r, o]) => sparkle(x, y, r, C.pinkSoft, o))
    .join("")
  const body = `
    <rect width="1120" height="600" fill="url(#sky)"/>
    <ellipse cx="560" cy="260" rx="420" ry="300" fill="url(#glow)"/>
    ${stars}
    <ellipse cx="560" cy="260" rx="300" ry="186" fill="none" stroke="${C.pinkSoft}" stroke-width="2" stroke-dasharray="2 12" stroke-linecap="round" opacity="0.5"/>
    ${friends}
    <path d="M506 330L480 440L512 422L534 450L550 342Z" fill="${C.rose}"/>
    <path d="M614 330L640 440L608 422L586 450L570 342Z" fill="${C.rose}"/>
    ${scallops}${circle(560, 260, 120, C.pink)}
    ${circle(560, 260, 98, "none", `stroke="${C.white}" stroke-width="4" stroke-dasharray="3 10" stroke-linecap="round"`)}
    ${symbol(560, 260, 112, C.white)}
    ${clouds(1120, 600, 528, 556, C.plum3)}`
  return hero(defs, body, C.plum)
}

function polaroid(x, y, rot, inner) {
  return `<g transform="translate(${x} ${y}) rotate(${rot})">
    <rect x="-92" y="-104" width="184" height="212" rx="10" fill="${C.plum}" opacity="0.08" transform="translate(6 10)"/>
    <rect x="-92" y="-104" width="184" height="212" rx="10" fill="${C.white}"/>
    <rect x="-76" y="-88" width="152" height="148" rx="6" fill="${C.pinkSoft}"/>
    <g clip-path="url(#photo)">${inner}</g>
  </g>`
}

function limitHero() {
  const defs = `${skyDefs("sky", C.blush, C.pink)}
    <clipPath id="photo"><rect x="-76" y="-88" width="152" height="148" rx="6"/></clipPath>
    <radialGradient id="holebg" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${C.pinkSoft}"/><stop offset="1" stop-color="${C.pinkSoft}"/></radialGradient>`
  let dots = ""
  for (let i = 0; i < 10; i++) {
    const a = Math.PI + (i / 9) * Math.PI
    dots += circle((560 + 300 * Math.cos(a)).toFixed(1), (330 + 230 * Math.sin(a)).toFixed(1), 11, C.white)
  }
  const body = `
    <rect width="1120" height="600" fill="url(#sky)"/>
    ${dots}
    ${polaroid(380, 300, -14, friedEgg(0, -14, 10, 0.95))}
    ${polaroid(740, 290, 12, donut(0, -14, 0, 0.95))}
    <g transform="translate(560 330)">
      <rect x="-150" y="-80" width="300" height="190" rx="40" fill="${C.plum}" opacity="0.12" transform="translate(0 14)"/>
      <rect x="-58" y="-112" width="116" height="50" rx="18" fill="${C.plum2}"/>
      <rect x="-150" y="-86" width="300" height="190" rx="40" fill="${C.plum}"/>
      <rect x="92" y="-64" width="34" height="16" rx="8" fill="${C.pink}"/>
      <rect x="-124" y="-62" width="40" height="10" rx="5" fill="${C.plum3}"/>
      ${circle(0, 10, 76, C.white)}${circle(0, 10, 60, C.pink)}${circle(0, 10, 36, C.plum)}
      ${circle(-14, -4, 10, C.white, 'opacity="0.9"')}${circle(14, 26, 5, C.white, 'opacity="0.6"')}
    </g>
    ${sparkle(170, 140, 16)}${sparkle(950, 130, 18)}${sparkle(880, 440, 10)}${sparkle(230, 470, 10)}
    ${clouds(1120, 600, 528, 556)}`
  return hero(defs, body, C.blush)
}

function recapHero() {
  const defs = `${skyDefs("sky", C.blush, C.pink)}
    <radialGradient id="holebg" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${C.pink}"/><stop offset="1" stop-color="${C.pink}"/></radialGradient>`
  const heights = [96, 140, 120, 176, 150, 196, 132]
  const bars = heights
    .map((h, i) => {
      const x = -186 + i * 56
      const fill = i === 5 ? C.rose : i % 2 ? C.carbs : C.pink
      return `<rect x="${x}" y="${100 - h}" width="36" height="${h}" rx="18" fill="${fill}"/>`
    })
    .join("")
  const line = [[-168, -40], [-112, -64], [-56, -50], [0, -96], [56, -84], [112, -124], [168, -110]]
  const body = `
    <rect width="1120" height="600" fill="url(#sky)"/>
    <g transform="translate(560 300) rotate(-4)">
      <rect x="-236" y="-170" width="472" height="320" rx="36" fill="${C.plum}" opacity="0.08" transform="translate(8 14)"/>
      <rect x="-236" y="-170" width="472" height="320" rx="36" fill="${C.white}"/>
      <rect x="-196" y="-138" width="120" height="14" rx="7" fill="${C.pinkSoft}"/>
      <rect x="-196" y="-114" width="72" height="14" rx="7" fill="${C.blush}"/>
      ${bars}
      <polyline points="${line.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${C.plum}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 -20)"/>
      ${line.map(([x, y]) => circle(x, y - 20, 9, C.white, `stroke="${C.plum}" stroke-width="5"`)).join("")}
    </g>
    ${dumbbell(900, 140, -22, 0.85)}
    ${friedEgg(200, 150, 10, 0.85)}
    ${strawberry(950, 380, 14, 0.9)}
    ${sparkle(130, 330, 16)}${sparkle(1000, 260, 12)}${sparkle(330, 80, 10)}${sparkle(760, 70, 12)}
    ${clouds(1120, 600, 528, 556)}`
  return hero(defs, body, C.blush)
}

// --- small things ---------------------------------------------------------------

/** A 112×112 (56 at 1x) pink tile with a plum line icon. */
function tile(icon, bg = C.pinkSoft) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="112" height="112" viewBox="0 0 112 112">
  <rect width="112" height="112" rx="32" fill="${bg}"/>
  <g fill="none" stroke="${C.plum}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">${icon}</g>
</svg>`
}

const ICONS = {
  camera: `<path d="M30 44h10l6-9h20l6 9h10a6 6 0 0 1 6 6v26a6 6 0 0 1-6 6H30a6 6 0 0 1-6-6V50a6 6 0 0 1 6-6Z"/><circle cx="56" cy="62" r="11"/>`,
  dumbbell: `<path d="M38 56h36"/><rect x="28" y="40" width="10" height="32" rx="4"/><rect x="74" y="40" width="10" height="32" rx="4"/><path d="M22 48v16M90 48v16"/>`,
  friends: `<circle cx="44" cy="46" r="9"/><path d="M28 78c0-10 7-16 16-16s16 6 16 16"/><circle cx="72" cy="48" r="8"/><path d="M66 63c2-1 4-1 6-1 8 0 14 6 14 14"/>`,
  photos: `<rect x="34" y="30" width="44" height="44" rx="8"/><path d="M26 44v32a8 8 0 0 0 8 8h32"/><circle cx="64" cy="44" r="5"/><path d="M34 66l12-12 18 18"/>`,
  infinity: `<path d="M56 56c-6-8-12-12-18-12a12 12 0 0 0 0 24c6 0 12-4 18-12Zm0 0c6 8 12 12 18 12a12 12 0 0 0 0-24c-6 0-12 4-18 12Z"/>`,
  pen: `<path d="M34 78l4-14 30-30a7 7 0 0 1 10 10L48 74l-14 4Z"/><path d="M64 38l10 10"/>`,
  flame: `<path d="M56 84c-13 0-22-9-22-21 0-14 14-22 14-34 9 5 14 14 13 22 4-2 6-6 7-10 6 6 10 13 10 22 0 12-9 21-22 21Z"/>`,
  scale: `<rect x="28" y="30" width="56" height="52" rx="12"/><path d="M46 46a14 14 0 0 1 20 0M56 52l5-6"/>`,
}

/** The referral progress row: `n` of 8 filled. 960×112 (480×56 at 1x). */
function referrals(n, total = 8) {
  const d = 96
  const gap = (960 - total * d) / (total - 1)
  let s = ""
  for (let i = 0; i < total; i++) {
    const cx = d / 2 + i * (d + gap)
    if (i < n) {
      s += circle(cx, 56, d / 2, C.pink) + symbol(cx, 57, 44, C.white)
    } else {
      s += circle(cx, 56, d / 2 - 3, C.white, `stroke="${C.dash}" stroke-width="4" stroke-dasharray="7 9" stroke-linecap="round"`)
      s += `<text x="${cx}" y="57" text-anchor="middle" dominant-baseline="central" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="26" fill="${C.dash}">${i + 1}</text>`
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="112" viewBox="0 0 960 112">${s}</svg>`
}

function lockup() {
  // 806×256 source, rendered 360 wide (120 at 1x).
  return `<svg xmlns="http://www.w3.org/2000/svg" width="363" height="114" viewBox="0 0 806 256">
  <path fill="${C.pink}" fill-rule="evenodd" d="${SYMBOL}"/>
  <path fill="${C.plum}" fill-rule="evenodd" transform="translate(272 34.24) scale(0.62)" d="${WORDMARK}"/>
</svg>`
}

function mark(fill, size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 256 256"><path fill="${fill}" fill-rule="evenodd" d="${SYMBOL}"/></svg>`
}

// --- write ----------------------------------------------------------------------

async function png(name, svg) {
  await sharp(Buffer.from(svg), { density: 72 }).png({ compressionLevel: 9, palette: false }).toFile(join(out, name))
  console.log("wrote", name)
}

await mkdir(out, { recursive: true })
await png("logo.png", lockup())
await png("mark.png", mark(C.pink, 96))
// The PWA icon, so every email image lives under email/ (one folder to upload).
await sharp(join(here, "..", "..", "web", "public", "icons", "icon-192.png")).resize(80, 80).png().toFile(join(out, "app-icon.png"))
await png("hero-welcome.png", welcomeHero())
await png("hero-friend.png", friendHero())
await png("hero-pro.png", proHero())
await png("hero-limit.png", limitHero())
await png("hero-recap.png", recapHero())
for (const [name, icon] of Object.entries(ICONS)) {
  await png(`icon-${name}.png`, tile(icon))
}
for (let n = 0; n <= 8; n++) {
  await png(`referrals-${n}.png`, referrals(n))
}
