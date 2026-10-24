"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useId, useState } from "react"
import { Button, Chip, ErrorCard, PageHeader, Skeleton } from "@/components/ui/primitives"
import { SearchIcon } from "@/components/ui/icons"
import { useMe } from "@/components/me-context"
import type { ShopKind, ShopResponse, ShopSort } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { KIND_LABEL, ShopCard } from "./shop-card"

const KINDS: ShopKind[] = ["routine", "template", "meal"]

const EMPTY: Record<ShopKind, string> = {
  routine: "No routines yet. Make one of yours public from the Gym tab and it'll show up here.",
  template: "No workouts yet. Set one of your workouts to Public to be the first.",
  meal: "No meals yet. Set one of your saved meals to Public to be the first.",
}

function parseKind(v: string | null): ShopKind {
  return KINDS.includes(v as ShopKind) ? (v as ShopKind) : "routine"
}

/** The community Shop: what people share publicly, plus friends' friends-only things. */
export function ShopScreen() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const me = useMe()
  const searchId = useId()
  const kind = parseKind(params.get("kind"))
  const sort: ShopSort = params.get("sort") === "popular" ? "popular" : "new"
  const q = params.get("q") ?? ""
  const [text, setText] = useState(q)

  function go(next: { kind?: ShopKind; sort?: ShopSort; q?: string }) {
    const sp = new URLSearchParams()
    sp.set("kind", next.kind ?? kind)
    if ((next.sort ?? sort) === "popular") sp.set("sort", "popular")
    const nq = (next.q ?? q).trim()
    if (nq) sp.set("q", nq)
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false })
  }

  // Search as you type, 250 ms after the last key.
  useEffect(() => {
    if (text.trim() === q.trim()) return
    const t = setTimeout(() => go({ q: text }), 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- go reads the current params
  }, [text])

  const query = `kind=${kind}&sort=${sort}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`

  return (
    <main className="app-column pb-safe flex min-h-dvh flex-col gap-3.5">
      <PageHeader
        back="history"
        eyebrow="Community"
        title="Shop"
        right={
          me.user.role === "admin" ? (
            <Link href="/shop/reports" className="flex min-h-[44px] items-center rounded-[12px] bg-white px-3 text-[14px] font-semibold no-underline">
              Reports
            </Link>
          ) : null
        }
      />
      <div role="radiogroup" aria-label="Category" className="flex gap-1.5">
        {KINDS.map((k) => (
          <Chip key={k} selected={k === kind} onClick={() => go({ kind: k })}>
            {KIND_LABEL[k]}
          </Chip>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor={searchId} className="relative flex flex-1 items-center">
          <span className="sr-only">Search {KIND_LABEL[kind].toLowerCase()}</span>
          <SearchIcon size={18} className="pointer-events-none absolute left-3.5 text-muted" />
          <input
            id={searchId}
            type="search"
            value={text}
            maxLength={60}
            placeholder={`Search ${KIND_LABEL[kind].toLowerCase()}`}
            onChange={(e) => setText(e.target.value)}
            className="min-h-[48px] w-full min-w-0 rounded-tile border border-line bg-white pl-10 pr-3.5 text-[15px] placeholder:text-muted/80"
          />
        </label>
        <label className="sr-only" htmlFor={`${searchId}-sort`}>
          Sort
        </label>
        <select
          id={`${searchId}-sort`}
          value={sort}
          onChange={(e) => go({ sort: e.target.value as ShopSort })}
          className="min-h-[48px] flex-none rounded-tile border border-line bg-white px-3 text-[14px] font-semibold"
        >
          <option value="new">Newest</option>
          <option value="popular">Most added</option>
        </select>
      </div>

      <Results key={query} query={query} kind={kind} searching={!!q.trim()} />
    </main>
  )
}

function Results({ query, kind, searching }: { query: string; kind: ShopKind; searching: boolean }) {
  const [pages, setPages] = useState(1)
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: pages }, (_, i) => (
        <Page key={i} query={query} offset={i * 30} last={i === pages - 1} first={i === 0} kind={kind} searching={searching} onMore={() => setPages((p) => p + 1)} />
      ))}
    </div>
  )
}

function Page({
  query,
  offset,
  first,
  last,
  kind,
  searching,
  onMore,
}: {
  query: string
  offset: number
  first: boolean
  last: boolean
  kind: ShopKind
  searching: boolean
  onMore: () => void
}) {
  const res = useApi<ShopResponse>(`shop?${query}${offset ? `&offset=${offset}` : ""}`)
  if (res.error && !res.data) return <ErrorCard message={res.error.message} onRetry={() => void res.reload()} />
  if (!res.data) {
    return (
      <div className="flex flex-col gap-2" role="status" aria-label="Loading">
        <Skeleton className="h-[96px] rounded-card" />
        {first ? <Skeleton className="h-[96px] rounded-card" /> : null}
      </div>
    )
  }
  const items = res.data.items
  if (first && items.length === 0) {
    return (
      <div className="rounded-card border-[1.5px] border-dashed border-dash p-4 text-[15px] text-muted">
        {searching ? "Nothing matches that. Try another word." : EMPTY[kind]}
      </div>
    )
  }
  return (
    <>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {items.map((it) => (
          <li key={it.id}>
            <ShopCard item={it} />
          </li>
        ))}
      </ul>
      {last && res.data.next_offset != null ? (
        <Button variant="outline" size="md" onClick={onMore}>
          Show more
        </Button>
      ) : null}
    </>
  )
}
