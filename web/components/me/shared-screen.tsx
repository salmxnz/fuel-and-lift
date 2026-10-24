"use client"

import { motion, useReducedMotion } from "motion/react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { useMe } from "@/components/me-context"
import { AcceptMealSheet, dayLabel, partLabel } from "@/components/share/incoming-shares"
import { StatusPill, firstName, joinNames } from "@/components/share/friend-picker"
import { Avatar, Button, ErrorCard, PageHeader, Skeleton } from "@/components/ui/primitives"
import { api, errorMessage, seg } from "@/lib/api/client"
import type {
  MealSlotsResponse,
  RoutineResponse,
  Share,
  ShareHistoryItem,
  ShareHistoryResponse,
  SharesResponse,
  TemplateResponse,
} from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { cn } from "@/lib/cn"
import { toISODate } from "@/lib/dates"
import { kcal } from "@/lib/format"
import { SPRING_SNAPPY } from "@/lib/motion"

type Direction = "received" | "sent"

const TABS: { value: Direction; label: string }[] = [
  { value: "received", label: "With you" },
  { value: "sent", label: "By you" },
]

const KIND_NOUN: Record<ShareHistoryItem["kind"], string> = { meal: "", template: "the workout ", routine: "the routine " }

/** "Addy split Pizza with you" / "You split Pizza with Addy and Sam". */
function sentence(it: ShareHistoryItem, direction: Direction, myId: string): string {
  const verb = it.kind === "meal" && it.split_ways ? "split" : "shared"
  const what = `${KIND_NOUN[it.kind]}${it.name}`
  if (direction === "received") return `${firstName(it.from.name)} ${verb} ${what} with you`
  const names = joinNames(it.recipients.filter((r) => r.id !== myId).map((r) => firstName(r.name)))
  return `You ${verb} ${what} with ${names}`
}

/** "Your half · 420 kcal · also with Sam · 24 Oct". */
function detailLine(it: ShareHistoryItem, direction: Direction, myId: string): string {
  const parts: string[] = []
  if (it.kind === "meal") {
    if (direction === "received") parts.push(partLabel(it.split_ways))
    else if (it.split_ways) parts.push(`${it.split_ways} ways`)
    if (it.kcal != null) parts.push(`${kcal(it.kcal)} kcal${direction === "sent" ? " each" : ""}`)
  }
  if (direction === "received") {
    const others = it.recipients.filter((r) => r.id !== myId).map((r) => firstName(r.name))
    if (others.length > 0) parts.push(`also with ${joinNames(others)}`)
  }
  const day = dayLabel(toISODate(new Date(it.created_at)))
  parts.push(day.charAt(0).toUpperCase() + day.slice(1))
  return parts.join(" · ")
}

/** Me → Shared: what friends sent you and what you sent, newest first. */
export function SharedScreen() {
  const [direction, setDirection] = useState<Direction>("received")
  const reduce = useReducedMotion()
  return (
    <main className="app-column pb-safe flex min-h-dvh flex-col gap-3">
      <PageHeader back="/me" backLabel="Back to Me" title="Shared" />
      <div role="radiogroup" aria-label="Which shares" className="grid grid-cols-2 rounded-full bg-chip p-[3px]">
        {TABS.map((t) => {
          const on = direction === t.value
          return (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setDirection(t.value)}
              className={cn(
                "relative min-h-[40px] rounded-full text-[14px] transition-[color,transform] duration-[160ms] ease-out active:scale-[0.97]",
                on ? "font-bold text-white" : "font-semibold text-ink-soft"
              )}
            >
              {on ? (
                <motion.span
                  layoutId="shared-tab-pill"
                  transition={reduce ? { duration: 0 } : SPRING_SNAPPY}
                  className="absolute inset-0 rounded-full bg-ink"
                  aria-hidden="true"
                />
              ) : null}
              <span className="relative">{t.label}</span>
            </button>
          )
        })}
      </div>
      <HistoryList key={direction} direction={direction} />
    </main>
  )
}

function HistoryList({ direction }: { direction: Direction }) {
  const me = useMe()
  const router = useRouter()
  const res = useApi<ShareHistoryResponse>(`shares/history?direction=${direction}`)
  // Pending shares carry what accepting needs (a meal's items).
  const waiting = useApi<SharesResponse>(direction === "received" ? "shares" : null)
  const [more, setMore] = useState<ShareHistoryItem[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [exhausted, setExhausted] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [adding, setAdding] = useState<Share | null>(null)
  const slots = useApi<MealSlotsResponse>(adding ? "meal-slots" : null)

  const items = [...(res.data?.items ?? []), ...more]
  const pending = waiting.data?.shares ?? []

  async function loadMore() {
    const last = items[items.length - 1]
    if (!last) return
    setLoadingMore(true)
    try {
      const next = await api.get<ShareHistoryResponse>(
        `shares/history?direction=${direction}&before=${encodeURIComponent(last.created_at)}`
      )
      setMore((m) => [...m, ...next.items])
      if (next.items.length === 0) setExhausted(true)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setLoadingMore(false)
    }
  }

  /** The written cache only holds the first page; later pages reload from scratch. */
  function refresh() {
    setMore([])
    setExhausted(false)
    void res.reload()
  }

  async function accept(s: Share) {
    if (s.meal) {
      setAdding(s)
      return
    }
    setBusy(s.id)
    try {
      if (s.template) {
        const r = await api.post<TemplateResponse>(`shares/${seg(s.id)}/accept`, {})
        toast.success(`${r.template.name} is in your templates`, {
          action: { label: "Open", onClick: () => router.push(`/gym/templates/${r.template.id}`) },
        })
      } else {
        const r = await api.post<RoutineResponse>(`shares/${seg(s.id)}/accept`, {})
        toast.success(`${r.routine.name} is in your routines`, {
          action: { label: "Open", onClick: () => router.push(`/gym/routines/${r.routine.id}`) },
        })
      }
      refresh()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function decline(s: Share) {
    setBusy(s.id)
    try {
      await api.del(`shares/${seg(s.id)}`)
      refresh()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  if (res.error && !res.data) return <ErrorCard message={res.error.message} onRetry={() => void res.reload()} />
  if (!res.data) {
    return (
      <div className="flex flex-col gap-2" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[76px] rounded-card" />
        ))}
      </div>
    )
  }
  if (items.length === 0) {
    return (
      <div className="rounded-card border-[1.5px] border-dashed border-dash p-4 text-[15px] text-muted">
        {direction === "received"
          ? "Nothing yet. Meals, workouts and routines friends send you show up here."
          : "Nothing yet. Share a meal from Today, or a workout or routine from Gym."}
      </div>
    )
  }

  return (
    <>
      <ul aria-label={direction === "received" ? "Shared with you" : "Shared by you"} className="m-0 flex list-none flex-col gap-2 p-0">
        {items.map((it) => {
          const mine = it.recipients.find((r) => r.id === me.user.id)
          const open = direction === "received" && mine?.status === "pending" ? pending.find((s) => s.id === it.id) : undefined
          const face = direction === "received" ? it.from : (it.recipients[0] ?? it.from)
          return (
            <li key={it.id} className="flex flex-col gap-2.5 rounded-card bg-white p-3.5">
              <div className="flex items-start gap-2.5">
                <Avatar name={face.name} url={face.avatar_url} size={40} tone="pink" />
                <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
                  <span className="text-[15px] font-semibold leading-[1.35]">{sentence(it, direction, me.user.id)}</span>
                  <span className="text-[13px] text-muted">{detailLine(it, direction, me.user.id)}</span>
                </div>
                {direction === "received" && mine ? <StatusPill status={mine.status} /> : null}
              </div>
              {direction === "sent" && it.recipients.length > 0 ? (
                <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                  {it.recipients.map((r) => (
                    <li key={r.id} className="flex items-center gap-1.5 rounded-full bg-ground py-[3px] pl-[3px] pr-1">
                      <Avatar name={r.name} url={r.avatar_url} size={20} tone="pink" />
                      <span className="text-[13px]">{firstName(r.name)}</span>
                      <StatusPill status={r.status} />
                    </li>
                  ))}
                </ul>
              ) : null}
              {open ? (
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <Button size="sm" onClick={() => void accept(open)} loading={busy === open.id}>
                    {open.meal ? "Add to my day" : open.template ? "Add to my templates" : "Add to my routines"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void decline(open)} disabled={busy === open.id} className="text-muted">
                    No thanks
                  </Button>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
      {items.length >= 30 && !exhausted ? (
        <Button variant="outline" size="md" onClick={() => void loadMore()} loading={loadingMore}>
          Show more
        </Button>
      ) : null}
      <AcceptMealSheet
        share={adding && slots.data ? adding : null}
        slots={slots.data?.meal_slots ?? []}
        onClose={() => setAdding(null)}
        onAdded={(_share, r, slotName) => {
          setAdding(null)
          refresh()
          toast.success(`Added to ${slotName.toLowerCase()}, ${dayLabel(r.day.date)}`, {
            action: { label: "View", onClick: () => router.push(`/today?date=${r.day.date}`) },
          })
        }}
      />
    </>
  )
}
