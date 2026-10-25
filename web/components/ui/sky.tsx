// The pink sky every tab opens under, from the emails and the landing page:
// white at the top, blush lower down, and a scalloped cloud line where it
// meets the page. Full bleed inside .app-column (see .sky in globals.css).

import type { CSSProperties, ReactNode } from "react"
import { cn } from "@/lib/cn"
import { bankPath, seeded } from "@/lib/clouds"

const BACK = bankPath({ width: 400, height: 56, baseline: 22, rMin: 14, rMax: 26, seed: 5 })
const FRONT = bankPath({ width: 400, height: 56, baseline: 34, rMin: 12, rMax: 22, seed: 4 })

const SPARKS = (() => {
  const rand = seeded(9)
  return Array.from({ length: 5 }, () => ({
    left: Math.round(rand() * 90 + 4),
    top: Math.round(rand() * 55 + 20),
    size: Math.round(7 + rand() * 7),
    delay: Math.round(rand() * 30) / 10,
  }))
})()

export function Sky({
  children,
  className,
  tone = "day",
}: {
  children: ReactNode
  /** Bottom padding decides how much the clouds overlap the content. */
  className?: string
  tone?: "day" | "dusk"
}) {
  return (
    <div className={cn("sky", tone === "dusk" && "sky-dusk", className)}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {SPARKS.map((s, i) => (
          <svg
            key={i}
            viewBox="0 0 24 24"
            className="sky-spark absolute"
            style={{ left: `${s.left}%`, top: `${s.top}%`, width: s.size, animationDelay: `${s.delay}s` } as CSSProperties}
          >
            <path d="M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12 7-1 11-5 12-12z" fill="#fff" />
          </svg>
        ))}
      </div>
      <div className="relative z-[2]">{children}</div>
      <svg aria-hidden="true" viewBox="0 0 400 56" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-[-1px] z-[3] h-[44px] w-full">
        <path className="sky-drift" d={BACK} fill={tone === "dusk" ? "#553646" : "#F6C9D8"} />
        <path d={FRONT} fill="var(--color-ground)" />
      </svg>
    </div>
  )
}

/**
 * One title row for a tab: the name on the left, round icon buttons on the
 * right. The title shrinks rather than pushing the buttons off screen.
 */
export function SkyTitle({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex min-h-[48px] items-center justify-between gap-2">
      <h1 className="m-0 min-w-0 truncate text-[clamp(26px,8.4vw,32px)] font-black leading-[1.05] tracking-[-0.045em]">{title}</h1>
      {children ? <div className="flex flex-none items-center gap-1.5">{children}</div> : null}
    </header>
  )
}

/** A frosted icon button for the sky header (44 px hit area). */
export const SKY_ICON =
  "flex h-11 w-11 flex-none items-center justify-center rounded-[14px] border border-white/85 bg-white/65 text-ink shadow-[inset_0_1px_0_#fff,0_4px_14px_rgba(168,47,97,0.10)] backdrop-blur-md transition-transform duration-150 ease-out active:scale-[0.96]"
