"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Radio, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { UserAvatar } from "@/components/user-avatar"
import type { Person } from "@/lib/api/types"
import { formatDateTime, formatFull } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * Filter values kept in the URL (the global log pages, so a view can be
 * shared) or in local state (the tabs on a user's page).
 */
export function useFilterState<K extends string>(keys: readonly K[], inUrl: boolean) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [local, setLocal] = useState<Record<string, string>>({})

  const values = Object.fromEntries(keys.map((k) => [k, (inUrl ? params.get(k) : local[k]) ?? ""])) as Record<K, string>

  function set(updates: Partial<Record<K, string>>) {
    if (!inUrl) {
      setLocal((prev) => ({ ...prev, ...updates }))
      return
    }
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(updates) as [string, string][]) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }
  return [values, set] as const
}

/** A text filter that reports 300 ms after typing stops. */
export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  className?: string
}) {
  const [text, setText] = useState(value)
  useEffect(() => {
    if (text.trim() === value) return
    const t = setTimeout(() => onChange(text.trim()), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])
  return (
    <div className={cn("relative min-w-48 flex-1", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="pl-8" />
    </div>
  )
}

/** Refetch every 5 s while on. */
export function LiveToggle({ live, onChange, fetching }: { live: boolean; onChange: (v: boolean) => void; fetching: boolean }) {
  return (
    <Button variant={live ? "default" : "outline"} size="sm" aria-pressed={live} onClick={() => onChange(!live)}>
      <Radio className={cn(live && fetching && "animate-pulse")} />
      Live
    </Button>
  )
}

export function TimeCell({ iso }: { iso: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(iso)}</span>
      </TooltipTrigger>
      <TooltipContent>{formatFull(iso)}</TooltipContent>
    </Tooltip>
  )
}

/** A person linking to their admin page, or a fallback label. */
export function PersonCell({ person, fallback }: { person: Person | null; fallback: string }) {
  if (!person) return <span className="text-muted-foreground">{fallback}</span>
  return (
    <Link
      href={`/users/${person.id}`}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex max-w-44 items-center gap-2 hover:underline"
    >
      <UserAvatar name={person.name || "?"} src={person.avatar_url} className="size-6" />
      <span className="truncate">{person.name || "Unnamed"}</span>
    </Link>
  )
}

/** label: value pairs in an expanded row. */
export function Details({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5 text-sm">
      {rows
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="min-w-0 break-words">{v}</dd>
          </div>
        ))}
    </dl>
  )
}
