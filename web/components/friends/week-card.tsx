"use client"

import Link from "next/link"
import { Avatar } from "@/components/ui/primitives"
import { ChevronRightIcon } from "@/components/ui/icons"
import type { Person, WeekSummary } from "@/lib/api/types"
import { cn } from "@/lib/cn"
import { todayISO } from "@/lib/dates"

const LETTERS = ["M", "T", "W", "T", "F", "S", "S"]

/**
 * Someone's week on the Friends tab and their profile: Mon–Sun dots (grey
 * when logged, pink when on target), days on target, protein and streak.
 * Never calories. summary null = they don't share their week.
 */
export function WeekCard({
  person,
  summary,
  isMe,
  href,
}: {
  person: Person
  summary: WeekSummary | null
  isMe?: boolean
  /** Makes the whole card a link (to their profile). */
  href?: string
}) {
  const body = (
    <>
      <div className="flex items-center gap-2.5">
        <Avatar name={person.name} url={person.avatar_url} size={40} tone={isMe ? "ink" : "lilac"} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-bold">{isMe ? "You" : person.name}</span>
          <span className="text-[12px] text-muted">{summary ? caption(summary, isMe) : "Not sharing their week"}</span>
        </div>
        {summary?.goal_hit ? (
          <span className="flex-none rounded-full bg-pink px-2.5 py-1 text-[12px] font-extrabold text-ink">Hit goal 🎉</span>
        ) : null}
        {href ? <ChevronRightIcon size={16} className="flex-none text-muted" /> : null}
      </div>
      {summary ? (
        <>
          <WeekDots summary={summary} />
          <p className="m-0 text-[13px] text-ink-soft">
            <strong className="text-ink">{summary.days_on_target}/7</strong> on target
            <span className="text-muted"> · </span>
            <strong className="text-ink">{summary.days_protein_hit}/7</strong> protein
            {summary.streak > 0 ? (
              <>
                <span className="text-muted"> · </span>🔥 <strong className="text-ink">{summary.streak}</strong>
              </>
            ) : null}
            {summary.workouts != null && summary.workouts > 0 ? (
              <>
                <span className="text-muted"> · </span>
                <strong className="text-ink">{summary.workouts}</strong> workout{summary.workouts === 1 ? "" : "s"}
              </>
            ) : null}
          </p>
        </>
      ) : null}
    </>
  )
  const className = "flex flex-col gap-2.5 rounded-card bg-white p-3.5 text-ink no-underline"
  return href ? (
    <Link href={href} className={cn(className, "transition-transform duration-[160ms] ease-out active:scale-[0.98]")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}

function caption(s: WeekSummary, isMe?: boolean): string {
  if (s.goal_hit) return isMe ? "Goal hit this week" : "Hit their goal this week"
  if (s.days_logged === 0) return "Nothing logged this week yet"
  const left = Math.max(0, s.goal_days - s.days_on_target)
  return `${left} more day${left === 1 ? "" : "s"} on target to hit the goal`
}

function WeekDots({ summary }: { summary: WeekSummary }) {
  const today = todayISO()
  const label = summary.days
    .map((d, i) => `${LETTERS[i]}: ${d.on_target ? "on target" : d.logged ? "logged" : d.date > today ? "to come" : "not logged"}`)
    .join(", ")
  return (
    <div role="img" aria-label={label} className="grid grid-cols-7 gap-1.5">
      {summary.days.map((d, i) => {
        const future = d.date > today && !d.logged
        return (
          <span key={d.date} className="flex flex-col items-center gap-1">
            <span
              aria-hidden="true"
              className={cn(
                "h-2.5 w-full rounded-full",
                d.on_target ? "bg-pink" : d.logged ? "bg-dash/60" : future ? "border border-dashed border-line" : "bg-line-soft"
              )}
            />
            <span aria-hidden="true" className={cn("text-[11px] font-semibold", d.date === today ? "text-ink" : "text-muted")}>
              {LETTERS[i]}
            </span>
          </span>
        )
      })}
    </div>
  )
}
