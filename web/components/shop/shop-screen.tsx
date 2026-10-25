"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useId, useState } from "react"
import { Button, ErrorCard, Skeleton } from "@/components/ui/primitives"
import { BowlIcon, DumbbellIcon, ListIcon, SearchIcon } from "@/components/ui/icons"
import { BackButton } from "@/components/ui/back-button"
import { Sky } from "@/components/ui/sky"
import { SplitSheet } from "@/components/gym/split-sheet"
import { cn } from "@/lib/cn"
import type { SplitsResponse } from "@/lib/api/types"
import { BiteMascot } from "./bite-mascot"
import { useMe } from "@/components/me-context"
import type { ShopKind, ShopResponse, ShopSort } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { KIND_LABEL, ShopCard } from "./shop-card"

const KINDS: ShopKind[] = ["routine", "template", "meal"]
const KIND_ICON: Record<ShopKind, React.ReactNode> = {
  routine: <ListIcon size={18} />,
  template: <DumbbellIcon size={18} />,
  meal: <BowlIcon size={18} />,
}

const EMPTY: Record<ShopKind, string> = {
  routine: "Nobody's put a routine out yet. Be the first: open one of yours in Gym, tap the lock and pick Everyone.",
  template: "No workouts out here yet. Open one of yours, tap the lock and pick Everyone to be first.",
  meal: "No meals out here yet. Open a saved meal, tap the lock and pick Everyone to be first.",
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
      <Sky className="pb-12">
        <div className="flex items-center justify-between gap-2">
          <BackButton href="history" label="Back" />
          {me.user.role === "admin" ? (
            <Link href="/shop/reports" className="flex min-h-11 items-center rounded-[14px] bg-white/70 px-3.5 text-[14px] font-bold text-ink no-underline backdrop-blur-md">
              Reports
            </Link>
          ) : null}
        </div>
        <div className="mt-1 flex items-end justify-between gap-2">
          <div className="flex min-w-0 flex-col pb-3">
            <h1 className="m-0 text-[clamp(32px,10vw,40px)] font-black leading-[0.95] tracking-[-0.05em]">Shop</h1>
            <p className="m-0 mt-1.5 max-w-[22ch] text-[14px] leading-[1.35] text-ink-soft">Routines, workouts and meals your crew and everyone else share. All free.</p>
          </div>
          <BiteMascot className="-mr-1 flex-none" />
        </div>

        <div role="radiogroup" aria-label="Category" className="mt-3 grid grid-cols-3 gap-1 rounded-[18px] border border-white/85 bg-white/65 p-1 backdrop-blur-md">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={k === kind}
              onClick={() => go({ kind: k })}
              className={cn(
                "flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-[14px] text-[13px] font-bold transition-[background-color,color] duration-200",
                k === kind ? "bg-ink text-white" : "text-ink-soft"
              )}
            >
              <span aria-hidden="true">{KIND_ICON[k]}</span>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>

        <div className="mt-2 flex items-center gap-2">
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
              className="min-h-[48px] w-full min-w-0 rounded-[14px] border border-white/85 bg-white/80 pl-10 pr-3.5 text-[15px] placeholder:text-muted/80"
            />
          </label>
          <label className="sr-only" htmlFor={`${searchId}-sort`}>
            Sort
          </label>
          <select
            id={`${searchId}-sort`}
            value={sort}
            onChange={(e) => go({ sort: e.target.value as ShopSort })}
            className="min-h-[48px] flex-none rounded-[14px] border border-white/85 bg-white/80 px-3 text-[14px] font-semibold"
          >
            <option value="new">Newest</option>
            <option value="popular">Most added</option>
          </select>
        </div>
      </Sky>

      {kind !== "meal" && !q.trim() ? <StarterPicks /> : null}

      <h2 className="m-0 text-[20px] font-black tracking-[-0.03em]">{q.trim() ? "Results" : "From the community"}</h2>
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

/** adebite's own splits, so the Shop is never empty: tap one to set it up. */
function StarterPicks() {
  const router = useRouter()
  const splits = useApi<SplitsResponse>("splits")
  const [open, setOpen] = useState<string | null>(null)
  const list = splits.data?.splits ?? []
  if (splits.loading) return <Skeleton className="h-[176px] rounded-card" />
  if (list.length === 0) return null
  return (
    <section aria-labelledby="starter" className="flex flex-col gap-2">
      <h2 id="starter" className="m-0 text-[20px] font-black tracking-[-0.03em]">
        Starter picks <span className="text-[13px] font-semibold text-muted">by adebite</span>
      </h2>
      <ul className="no-scrollbar -mx-4 m-0 flex list-none snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-1">
        {list.map((sp, i) => (
          <li key={sp.key} className="snap-start">
            <button
              type="button"
              onClick={() => setOpen(sp.key)}
              className={cn(
                "flex h-[176px] w-[230px] flex-col justify-between rounded-card p-4 text-left transition-transform duration-150 ease-out active:scale-[0.98]",
                i % 3 === 0 ? "bg-ink text-white" : i % 3 === 1 ? "bg-pink text-ink" : "bg-white text-ink"
              )}
            >
              <span className="flex flex-col gap-1">
                <span className={cn("text-[12px] font-bold", i % 3 === 0 ? "text-pink" : "text-protein")}>
                  {sp.min_days === sp.max_days ? `${sp.min_days} days` : `${sp.min_days}–${sp.max_days} days`} a week
                </span>
                <span className="text-[21px] font-black leading-[1.05] tracking-[-0.035em]">{sp.name}</span>
                <span className={cn("line-clamp-2 text-[12.5px] leading-[1.35]", i % 3 === 0 ? "text-night-muted" : "text-ink-soft")}>{sp.description}</span>
              </span>
              <span className="flex items-center justify-between gap-2">
                <span className={cn("truncate text-[12px]", i % 3 === 0 ? "text-night-muted" : "text-muted")}>
                  {sp.workouts.map((w) => w.name).join(" · ")}
                </span>
                <span className={cn("flex-none rounded-full px-3 py-1.5 text-[13px] font-extrabold", i % 3 === 0 ? "bg-pink text-ink" : "bg-ink text-white")}>
                  Use it
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <SplitSheet
        open={open !== null}
        initialKey={open ?? undefined}
        onClose={() => setOpen(null)}
        onApplied={() => {
          setOpen(null)
          router.push("/gym")
        }}
      />
    </section>
  )
}
