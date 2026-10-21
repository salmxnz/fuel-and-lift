"use client"

import { motion, useReducedMotion } from "motion/react"
import { useEffect, useState } from "react"
import { FireIcon, TrophyIcon } from "@/components/ui/icons"
import { Skeleton } from "@/components/ui/primitives"
import type { StreakResponse } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { cn } from "@/lib/cn"
import { addDays, todayISO, weekdayLetter } from "@/lib/dates"
import { pixelSrc, type RewardKey } from "@/lib/exercise-art"
import { SPRING_POP } from "@/lib/motion"

const SEEN_KEY = "adebite:seen-milestones"

/** The badge for each streak milestone. */
function badgeFor(days: number): RewardKey {
  if (days <= 3) return "medal_bronze"
  if (days <= 7) return "medal_silver"
  if (days <= 14) return "medal_gold"
  return "trophy"
}

/** A pixel reward icon, or a line drawing if the pixel pack isn't installed. */
export function RewardIcon({ name, size = 32, className }: { name: RewardKey; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    const Icon = name === "fire" ? FireIcon : TrophyIcon
    return <Icon size={size} className={cn(name === "fire" ? "text-protein" : "text-ink", className)} />
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static pixel art; next/image would smooth it
    <img
      src={pixelSrc(name)}
      alt=""
      width={size}
      height={size}
      draggable={false}
      onError={() => setFailed(true)}
      className={className}
      style={{ imageRendering: "pixelated" }}
    />
  )
}

function readSeen(): Set<number> {
  if (typeof window === "undefined") return new Set()
  try {
    return new Set((JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? "[]") as number[]).filter(Number.isFinite))
  } catch {
    return new Set()
  }
}

/** Progress → Rewards: the streak with its fire, the last 7 days, and milestone badges. */
export function RewardsCard() {
  const res = useApi<StreakResponse>("progress/streak")
  const reduce = useReducedMotion()
  // Badges reached since the last visit pop once.
  const [seen] = useState(readSeen)
  const st = res.data?.streak

  useEffect(() => {
    if (!st) return
    try {
      const reached = st.milestones.filter((m) => m.reached).map((m) => m.days)
      window.localStorage.setItem(SEEN_KEY, JSON.stringify(reached))
    } catch {
      /* private mode */
    }
  }, [st])

  if (!st) {
    return res.error ? null : <Skeleton className="h-[220px] rounded-card" />
  }

  const today = todayISO()
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))
  const hint =
    st.current === 0
      ? "Log a meal or finish a workout to start a streak."
      : st.active_today
        ? "Today counts. Come back tomorrow to keep it going."
        : "Log something today to keep it going."

  return (
    <section aria-labelledby="rewards-title" className="flex flex-col gap-3.5 rounded-card bg-white p-4">
      <h2 id="rewards-title" className="m-0 text-[13px] font-semibold text-muted">
        Rewards
      </h2>

      <div className="flex items-center gap-3.5">
        <span className={cn("flex h-16 w-16 flex-none items-center justify-center rounded-tile", st.current > 0 ? "bg-pink-soft" : "bg-chip grayscale")}>
          <RewardIcon name="fire" size={st.current > 0 ? 64 : 32} className={st.current > 0 ? undefined : "opacity-50"} />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="text-[34px] font-extrabold leading-none tracking-[-0.02em] tabular-nums">
            {st.current}
            <span className="ml-1.5 text-[16px] font-bold tracking-normal text-muted">day streak</span>
          </span>
          <span className="mt-1 text-[13px] text-muted">
            Best {st.best} day{st.best === 1 ? "" : "s"} · {hint}
          </span>
        </div>
      </div>

      <ol aria-label="The last 7 days" className="m-0 grid list-none grid-cols-7 gap-1 p-0">
        {days.map((d, i) => (
          <li key={d} className="flex flex-col items-center gap-1 text-[11px] text-muted">
            <span
              aria-label={`${d}: ${st.last_7[i] ? "active" : "nothing logged"}`}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full",
                st.last_7[i] ? "bg-pink text-ink" : "border-[1.5px] border-dashed border-dash"
              )}
            >
              {st.last_7[i] ? <FireIcon size={14} strokeWidth={2.2} /> : null}
            </span>
            <span aria-hidden="true" className={cn(d === today && "font-bold text-ink")}>
              {weekdayLetter(d)}
            </span>
          </li>
        ))}
      </ol>

      <ul aria-label="Streak badges" className="m-0 grid list-none grid-cols-4 gap-2 p-0">
        {st.milestones.map((m) => {
          const fresh = m.reached && !seen.has(m.days)
          return (
            <motion.li
              key={m.days}
              initial={fresh ? (reduce ? { opacity: 0 } : { opacity: 0, transform: "scale(0.9)" }) : false}
              animate={{ opacity: 1, transform: "scale(1)" }}
              transition={reduce ? { duration: 0.2 } : SPRING_POP}
              className={cn(
                "flex flex-col items-center gap-1 rounded-tile px-1 py-2.5",
                m.reached ? "bg-pink-soft" : "bg-field"
              )}
            >
              <RewardIcon name={badgeFor(m.days)} size={32} className={m.reached ? undefined : "opacity-40 grayscale"} />
              <span className={cn("text-[12px] font-bold", m.reached ? "text-ink" : "text-muted")}>{m.days} days</span>
              <span className="sr-only">{m.reached ? "earned" : "not earned yet"}</span>
            </motion.li>
          )
        })}
      </ul>
    </section>
  )
}
