// Scalloped cloud banks, drawn the same way on the landing page, in the
// emails and on every tab's sky header. Deterministic, so server and client
// draw identical paths.


/** Rounds drawn coordinates so the server and the browser print the same digits. */
export const r2 = (n: number) => Math.round(n * 100) / 100

/** Small deterministic PRNG so server and client draw the same clouds. */
export function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A scalloped cloud bank like the bottom edge of the email headers: a row of
 * half-circles on a baseline, filled down to the bottom of the box.
 */
export function bankPath({
  width,
  height,
  baseline,
  rMin,
  rMax,
  seed,
  overhang = 200,
}: {
  width: number
  height: number
  baseline: number
  rMin: number
  rMax: number
  seed: number
  overhang?: number
}) {
  const rand = seeded(seed)
  let x = -overhang
  let y = baseline
  let d = `M${x} ${height} L${x} ${y}`
  while (x < width + overhang) {
    const r = rMin + rand() * (rMax - rMin)
    const ny = baseline + (rand() - 0.5) * rMin * 0.5
    d += ` A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${(x + r * 2).toFixed(1)} ${ny.toFixed(1)}`
    x += r * 2
    y = ny
  }
  d += ` L${x} ${height} Z`
  return d
}
