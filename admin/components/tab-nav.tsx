"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

export type Tab = { href: string; label: string; count?: number; exact?: boolean }

/** Underline tabs, one route each. */
export function TabNav({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname()
  return (
    <nav aria-label="User sections" className="-mb-px flex gap-6 overflow-x-auto border-b [scrollbar-width:none]">
      {tabs.map((t) => {
        const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`)
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 border-b-2 pb-2.5 pt-1 text-sm font-medium transition-colors",
              active ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
            )}
          >
            {t.label}
            {t.count !== undefined ? (
              <span className="rounded-full bg-muted px-1.5 py-px text-[11px] tabular-nums text-muted-foreground">{t.count}</span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
