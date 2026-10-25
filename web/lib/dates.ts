// Local-calendar date helpers. API dates are plain YYYY-MM-DD in the user's
// time zone, so never go through UTC (toISOString) to make one.

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function todayISO(): string {
  return toISODate(new Date())
}

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isISODate(s: string | null | undefined): s is string {
  if (!s || !ISO_DATE_RE.test(s)) return false
  const d = parseISODate(s)
  return toISODate(d) === s
}

/** Midday local time avoids DST edge cases when adding days. */
export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12)
}

export function addDays(s: string, n: number): string {
  const d = parseISODate(s)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

export function addMonths(s: string, n: number): string {
  const d = parseISODate(s)
  d.setMonth(d.getMonth() + n)
  return toISODate(d)
}

/** Monday of the week containing `s`. */
export function startOfWeek(s: string): string {
  const d = parseISODate(s)
  const dow = (d.getDay() + 6) % 7 // Mon=0
  d.setDate(d.getDate() - dow)
  return toISODate(d)
}

export function weekDays(s: string): string[] {
  const start = startOfWeek(s)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number]

export function weekdayKey(s: string): WeekdayKey {
  const dow = (parseISODate(s).getDay() + 6) % 7
  return WEEKDAY_KEYS[dow]
}

export function formatLong(s: string): string {
  return parseISODate(s).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
}

export function formatDayMonth(s: string): string {
  return parseISODate(s).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

export function formatMonthYear(s: string): string {
  return parseISODate(s).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
}

export function formatShortMonthYear(s: string): string {
  const d = parseISODate(s)
  return `${d.toLocaleDateString("en-GB", { month: "short" })} ${String(d.getFullYear()).slice(2)}`
}

export function weekdayName(s: string): string {
  return parseISODate(s).toLocaleDateString("en-GB", { weekday: "long" })
}

export function weekdayLetter(s: string): string {
  return parseISODate(s).toLocaleDateString("en-GB", { weekday: "narrow" })
}

export function timeHM(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
}

export function relativeDay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const day = toISODate(d)
  const today = todayISO()
  if (day === today) return "Today"
  if (day === addDays(today, -1)) return "Yesterday"
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86_400_000)
}

export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

/**
 * The one name a day gets as a screen title: Today, Yesterday, Tomorrow, the
 * weekday within a week either side, else "Fri 9 Oct". Never the date twice.
 */
export function dayTitle(s: string, today: string = todayISO()): string {
  const d = daysBetween(today, s)
  if (d === 0) return "Today"
  if (d === -1) return "Yesterday"
  if (d === 1) return "Tomorrow"
  if (Math.abs(d) < 7) return weekdayName(s)
  return parseISODate(s).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
}
