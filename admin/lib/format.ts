// Display helpers. Dates from the API are YYYY-MM-DD (local to the user) and
// timestamps are RFC 3339.

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" })
const shortFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" })
const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" })

/** "2026-03-12" as a local date (not UTC midnight). */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number)
  return new Date(y, m - 1, d)
}

/** A local date as "YYYY-MM-DD". */
export function toDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  return dateFmt.format(iso.length === 10 ? parseDay(iso) : new Date(iso))
}

/** "12 Mar" this year, "12 Mar 2027" otherwise. */
export function formatShortDate(iso: string): string {
  const d = iso.length === 10 ? parseDay(iso) : new Date(iso)
  return d.getFullYear() === new Date().getFullYear() ? shortFmt.format(d) : dateFmt.format(d)
}

export function formatDay(day: string): string {
  return dayFmt.format(parseDay(day))
}

export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso))
}

/** "just now", "5 min ago", "3 h ago", "2 d ago", then a date. */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "never"
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.round(ms / 60_000)
  if (min < 1) return "just now"
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d} d ago`
  return formatDate(iso)
}

export function formatDuration(fromIso: string, toIso: string | null): string {
  if (!toIso) return "—"
  const min = Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60_000))
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`
}

export const kcal = (n: number) => `${Math.round(n).toLocaleString("en-GB")} kcal`
export const grams = (n: number) => `${Math.round(n)} g`

export function age(dateOfBirth: string): number {
  const dob = parseDay(dateOfBirth)
  const now = new Date()
  let years = now.getFullYear() - dob.getFullYear()
  if (now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) years--
  return years
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`
}
