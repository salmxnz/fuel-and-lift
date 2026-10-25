"use client"

// The Gym tab's sky and today's card, as in the app proposal: a floating
// dumbbell over a frosted ticket that says what's on today with Start right
// there, and a card listing today's exercises against what you did last time.

import Link from "next/link"
import type { CSSProperties, ReactNode } from "react"
import { Dumbbell } from "@/components/landing/art"
import { Spinner } from "@/components/ui/primitives"
import type { Session, Template, TemplateBlock } from "@/lib/api/types"
import { relativeDay } from "@/lib/dates"

/** About how long a template takes: each working set plus its rest, and cardio minutes. */
export function templateMinutes(t: Template): number {
  let s = 0
  for (const b of t.blocks) {
    if (b.cardio) {
      s += b.cardio.minutes * 60
      continue
    }
    const sets = b.sets.length || 3
    s += sets * (40 + (b.rest_seconds ?? 90))
  }
  return Math.max(5, Math.round(s / 300) * 5)
}

export function PlanHero({ label, title, sub, action }: { label: string; title: string; sub: string; action: ReactNode }) {
  return (
    <div className="relative -mx-4 h-[204px]">
      <div aria-hidden="true" className="app-float absolute right-[34px] top-0 w-[112px]" style={{ "--r": "-18deg", "--t": "6s" } as CSSProperties}>
        <Dumbbell className="w-full drop-shadow-[0_10px_18px_rgba(46,26,36,0.22)]" />
      </div>
      <div className="ticket absolute inset-x-4 bottom-[40px] flex items-end justify-between gap-3 rounded-[22px] bg-white/85 px-[18px] py-4 backdrop-blur-md">
        <div className="flex min-w-0 flex-col">
          <span className="text-[13px] font-bold text-protein">{label}</span>
          <span className="mt-1 truncate text-[30px] font-black leading-none tracking-[-0.045em]">{title}</span>
          <span className="mt-1.5 truncate text-[13px] text-muted">{sub}</span>
        </div>
        {action}
      </div>
    </div>
  )
}

/** The plum button on the ticket: a link or a button. */
export function TicketButton({
  children,
  href,
  onClick,
  loading,
  disabled,
}: {
  children: ReactNode
  href?: string
  onClick?: () => void
  loading?: boolean
  disabled?: boolean
}) {
  const cls =
    "flex h-11 flex-none items-center justify-center gap-2 whitespace-nowrap rounded-[14px] bg-ink px-4 text-[15px] font-extrabold text-white no-underline transition-transform duration-150 ease-out active:scale-[0.97] disabled:opacity-60"
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled || loading} aria-busy={loading || undefined} className={cls}>
      {loading ? <Spinner size={16} /> : null}
      {children}
    </button>
  )
}

function setsLabel(b: TemplateBlock): string {
  if (b.cardio) return `${b.cardio.minutes} min${b.cardio.incline ? ` · incline ${b.cardio.incline}` : ""}`
  const work = b.sets.filter((s) => !s.warmup)
  if (work.length === 0) return "No sets yet"
  const reps = work.map((s) => s.target_reps).filter((r): r is number => r != null)
  const lo = Math.min(...reps)
  const hi = Math.max(...reps)
  const r = reps.length === 0 ? (work.some((s) => s.to_failure) ? "max" : "?") : lo === hi ? `${lo}` : `${lo}–${hi}`
  return `${work.length} × ${r}`
}

function topKg(nums: (number | null)[]): number | null {
  const n = nums.filter((x): x is number => x != null && x > 0)
  return n.length ? Math.max(...n) : null
}

const fmtKg = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1))

/** Today's exercises: target, what you lifted last time, and the jump. */
export function TodayExercises({ template, last }: { template: Template; last: Session | undefined }) {
  const blocks = [...template.blocks].sort((a, b) => a.position - b.position)
  if (blocks.length === 0) return null
  return (
    <section aria-labelledby="today-ex" className="flex flex-col rounded-card bg-white px-4 pb-1.5 pt-4">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h2 id="today-ex" className="m-0 truncate text-[18px] font-black tracking-[-0.035em]">
          {template.name}
        </h2>
        <span className="flex-none text-[13px] text-muted">{last ? `Last time ${relativeDay(last.started_at).split(" ")[0]}` : "First time"}</span>
      </div>
      <ol className="m-0 flex list-none flex-col p-0">
        {blocks.map((b, i) => {
          const prev = last?.blocks.find((x) => x.exercise.id === b.exercise.id && !x.skipped)
          const lastKg = prev ? topKg(prev.sets.filter((s) => s.done && !s.warmup).map((s) => s.actual_kg)) : null
          const target = topKg(b.sets.filter((s) => !s.warmup).map((s) => s.target_kg))
          const diff = lastKg != null && target != null ? Math.round((target - lastKg) * 10) / 10 : null
          const chip = b.cardio
            ? null
            : diff == null
              ? target != null
                ? `${fmtKg(target)} kg`
                : null
              : diff > 0
                ? `+${fmtKg(diff)} kg`
                : diff < 0
                  ? `${fmtKg(diff)} kg`
                  : "Same"
          return (
            <li key={b.id} className="border-t border-line-soft first:border-t-0">
              <Link
                href={`/gym/templates/${template.id}`}
                className="grid grid-cols-[44px_1fr_auto] items-center gap-3 py-[11px] text-ink no-underline"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-[13px] bg-pink-soft text-[17px] font-black text-protein">
                  {i + 1}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15.5px] font-extrabold">{b.exercise.name}</span>
                  <span className="truncate text-[13px] text-muted">
                    {setsLabel(b)}
                    {lastKg != null ? ` · last ${fmtKg(lastKg)} kg` : ""}
                  </span>
                </span>
                {chip ? (
                  <span className="whitespace-nowrap rounded-[8px] bg-pink-soft px-2 py-1 text-[12px] font-extrabold text-protein">{chip}</span>
                ) : (
                  <span />
                )}
              </Link>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
