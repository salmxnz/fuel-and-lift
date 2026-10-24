"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion } from "motion/react"
import { useAddFlow } from "@/components/food/add-flow"
import { ChartIcon, DumbbellIcon, HomeIcon, PersonIcon, PlusIcon } from "@/components/ui/icons"
import { cn } from "@/lib/cn"
import { SPRING_SNAPPY } from "@/lib/motion"
import { useState } from "react"

const TABS = [
  { href: "/today", label: "Today", Icon: HomeIcon, match: ["/today"] },
  { href: "/gym", label: "Gym", Icon: DumbbellIcon, match: ["/gym"] },
  { href: "/progress", label: "Progress", Icon: ChartIcon, match: ["/progress"] },
  {
    href: "/me",
    label: "Me",
    Icon: PersonIcon,
    match: ["/me", "/friends", "/sharing", "/meals", "/saved-meals", "/settings"],
  },
] as const

function isActive(pathname: string, match: readonly string[]) {
  return match.some((m) => pathname === m || pathname.startsWith(`${m}/`))
}

/**
 * Floating liquid-glass tab bar plus the round pink + button.
 *
 * Must stay a direct child of the body-level layout: backdrop-filter samples
 * what is behind the element, and any ancestor with filter / opacity /
 * transform would create a new backdrop root (and break position: fixed).
 * The active tab's "lens" moves between tabs with a shared layoutId; motion
 * honours prefers-reduced-motion through <MotionConfig reducedMotion="user">.
 * prefers-reduced-transparency falls back to a solid bar (see .glass).
 */
export function GlassNav() {
  const pathname = usePathname()
  const { openMenu, menuOpen } = useAddFlow()
  // The lens moves on tap, not when the new route arrives; once the path
  // changes, the path decides again.
  const [tapped, setTapped] = useState<{ href: string; from: string } | null>(null)
  const pendingHref = tapped && tapped.from === pathname ? tapped.href : null

  return (
    // layoutRoot: the lens is measured inside this fixed bar, not with the page scroll.
    <motion.nav
      layoutRoot
      aria-label="Main"
      className="pointer-events-none fixed inset-x-0 z-40"
      style={{ bottom: "max(26px, calc(var(--safe-bottom) + 8px))" }}
    >
      <div className="pointer-events-auto mx-auto flex max-w-[var(--app-max)] items-center gap-2.5 px-4">
        <div className="glass grid flex-1 grid-cols-4 rounded-full p-[5px]">
          {TABS.map(({ href, label, Icon, match }) => {
            const active = pendingHref ? pendingHref === href : isActive(pathname, match)
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setTapped({ href, from: pathname })}
                data-tour={`tab-${label.toLowerCase()}`}
                aria-current={isActive(pathname, match) ? "page" : undefined}
                className={cn(
                  "relative flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-full py-[7px] text-[11px] no-underline transition-transform duration-[160ms] ease-out active:scale-[0.97]",
                  active ? "font-bold text-ink" : "font-semibold text-ink-soft"
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="nav-lens"
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-white/90 shadow-lens"
                    transition={SPRING_SNAPPY}
                  />
                ) : null}
                <Icon size={22} className="relative" />
                <span className="relative leading-none">{label}</span>
              </Link>
            )
          })}
        </div>
        <button
          type="button"
          aria-label="Add food, workout or weigh-in"
          data-tour="fab"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onClick={openMenu}
          className="flex h-[62px] w-[62px] flex-none items-center justify-center rounded-full border border-[rgba(46,26,36,0.15)] bg-pink text-ink shadow-fab transition-transform duration-[160ms] ease-out active:scale-[0.95]"
        >
          <PlusIcon size={26} strokeWidth={2.2} />
        </button>
      </div>
    </motion.nav>
  )
}
