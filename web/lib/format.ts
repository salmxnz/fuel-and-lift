const intFmt = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 })
const oneFmt = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 })

/** 1,095 */
export function kcal(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "0"
  return intFmt.format(Math.round(n))
}

/** 52.5 (one decimal at most) */
export function num1(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "0"
  return oneFmt.format(Math.round(n * 10) / 10)
}

/** 37.5 kg */
export function kg(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "–"
  return `${oneFmt.format(Math.round(n * 10) / 10)} kg`
}

export function signed(n: number, digits = 0): string {
  const r = digits ? Math.round(n * 10 ** digits) / 10 ** digits : Math.round(n)
  const s = digits ? oneFmt.format(Math.abs(r)) : intFmt.format(Math.abs(r))
  return `${r > 0 ? "+" : r < 0 ? "−" : "±"}${s}`
}

export function pct(part: number, whole: number): number {
  if (!whole || whole <= 0) return 0
  return Math.max(0, Math.min(100, (part / whole) * 100))
}

export function initial(name: string | null | undefined): string {
  const t = (name ?? "").trim()
  return t ? t[0].toUpperCase() : "?"
}

export const LB_PER_KG = 2.20462
export const CM_PER_IN = 2.54

export function kgToLb(v: number): number {
  return v * LB_PER_KG
}
export function lbToKg(v: number): number {
  return v / LB_PER_KG
}

/** Parse a user-typed decimal ("37,5" or "37.5"). Returns null when empty/invalid. */
export function parseDecimal(raw: string): number | null {
  const t = raw.trim().replace(",", ".")
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** Trim and cut to max characters, as the API counts them (80 for food items and entries, 60 for saved meals). */
export function clip(s: string, max: number): string {
  const chars = Array.from(s.trim())
  return chars.length <= max ? chars.join("") : chars.slice(0, max).join("").trim()
}
