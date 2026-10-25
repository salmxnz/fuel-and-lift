"use client"

// Someone's page: under the pink sky, what they're up to right now (training,
// with Train together), what they've eaten today when they share it, their
// week, their recent activity and everything they share with you.

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { Avatar, Button, ErrorCard, LoadingBlock, PageHeader, Switch } from "@/components/ui/primitives"
import { MoreIcon } from "@/components/ui/icons"
import { BackButton } from "@/components/ui/back-button"
import { Sheet } from "@/components/ui/sheet"
import { Sky, SKY_ICON } from "@/components/ui/sky"
import { ShopCard, KIND_LABEL } from "@/components/shop/shop-card"
import { WeekCard } from "@/components/friends/week-card"
import { FeedCard } from "@/components/friends/feed-card"
import { LiveTrainingCard } from "@/components/friends/live-training"
import { FoodIconTile } from "@/components/food/food-icon"
import { api, errorMessage, seg } from "@/lib/api/client"
import type { FeedItem, FeedItemResponse, FriendResponse, PersonViewResponse, ShopItem, ShopKind } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { formatMonthYear, timeHM } from "@/lib/dates"

export function PersonScreen({ id }: { id: string }) {
  const res = useApi<PersonViewResponse>(`people/${seg(id)}`)
  const [menuOpen, setMenuOpen] = useState(false)

  if (res.error && !res.data) {
    return (
      <main className="app-column pb-safe flex flex-col gap-4">
        <PageHeader back="history" title="Profile" />
        <ErrorCard
          message={res.error.status === 404 ? "Nothing to see here: they haven't shared anything with you." : res.error.message}
          onRetry={res.error.status === 404 ? undefined : () => void res.reload()}
        />
      </main>
    )
  }
  if (!res.data) {
    return (
      <main className="app-column">
        <LoadingBlock label="Loading profile" />
      </main>
    )
  }

  const v = res.data
  const first = v.person.name.split(" ")[0]
  const sections: { kind: ShopKind; items: ShopItem[] }[] = [
    { kind: "routine", items: v.routines },
    { kind: "template", items: v.templates },
    { kind: "meal", items: v.meals },
  ]
  const total = v.routines.length + v.templates.length + v.meals.length
  const activity = (v.activity ?? []).filter((a) => a.kind !== "workout_started")

  async function cheer(item: FeedItem) {
    const swap = (it: FeedItem) => res.setData((prev) => {
        const cur = prev ?? v
        return { ...cur, activity: (cur.activity ?? []).map((x) => (x.id === it.id ? it : x)) }
      })
    swap({ ...item, cheered_by_me: !item.cheered_by_me, cheers: item.cheers + (item.cheered_by_me ? -1 : 1) })
    try {
      const r = item.cheered_by_me
        ? await api.del<FeedItemResponse>(`feed/${seg(item.id)}/cheer`)
        : await api.post<FeedItemResponse>(`feed/${seg(item.id)}/cheer`)
      if (r?.item) swap(r.item)
    } catch (err) {
      swap(item)
      toast.error(errorMessage(err))
    }
  }

  return (
    <main className="app-column pb-safe flex min-h-dvh flex-col gap-4">
      <Sky className="pb-14">
        <div className="flex items-center justify-between">
          <BackButton href="history" label="Back" />
          {v.is_friend ? (
            <button type="button" aria-label={`Options for ${v.person.name}`} aria-haspopup="dialog" onClick={() => setMenuOpen(true)} className={SKY_ICON}>
              <MoreIcon size={22} />
            </button>
          ) : v.is_me ? (
            <Link href="/sharing" className="flex min-h-11 items-center rounded-[14px] bg-white/70 px-3.5 text-[14px] font-bold text-ink no-underline backdrop-blur-md">
              What friends see
            </Link>
          ) : null}
        </div>
        <div className="mt-1 flex flex-col items-center gap-1.5 text-center">
          <span className="rounded-full bg-white p-1 shadow-[0_10px_30px_rgba(168,47,97,0.18)]">
            <Avatar name={v.person.name} url={v.person.avatar_url} size={84} />
          </span>
          <h1 className="m-0 mt-1 text-[28px] font-black leading-[1.05] tracking-[-0.04em]">{v.is_me ? "You" : v.person.name}</h1>
          <span className="text-[14px] text-ink-soft">
            {v.is_me
              ? "What your crew and the Shop see"
              : v.is_friend && v.friends_since
                ? `In your crew since ${formatMonthYear(v.friends_since)}`
                : "Shares stuff in the Shop"}
          </span>
        </div>
      </Sky>

      {v.training ? <LiveTrainingCard live={v.training} canJoin={v.is_friend} /> : null}

      {v.is_friend ? (
        <section aria-labelledby="p-today" className="flex flex-col gap-2">
          <h2 id="p-today" className="m-0 text-[20px] font-black tracking-[-0.03em]">
            {first}&apos;s eats today
          </h2>
          {v.meals_today == null ? (
            <p className="m-0 rounded-card border-[1.5px] border-dashed border-dash p-4 text-[14px] text-muted">
              {first} keeps their meals to themselves.
            </p>
          ) : v.meals_today.length === 0 ? (
            <p className="m-0 rounded-card border-[1.5px] border-dashed border-dash p-4 text-[14px] text-muted">Nothing logged yet today.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col rounded-card bg-white px-3.5 py-1">
              {v.meals_today.map((m) => (
                <li key={m.entry_id} className="flex items-center gap-3 border-b border-line-soft py-2.5 last:border-b-0">
                  <FoodIconTile icon={m.icon} size={44} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-bold">{m.name}</span>
                    <span className="text-[12px] text-muted">
                      {m.meal_name} · {timeHM(m.logged_at)}
                    </span>
                  </span>
                  <Link
                    href={`/log/describe?text=${encodeURIComponent(m.name)}`}
                    className="flex min-h-9 flex-none items-center rounded-full bg-pink-soft px-3 text-[13px] font-bold text-ink no-underline"
                  >
                    Same here
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {v.is_me || v.is_friend ? (
        <section aria-labelledby="p-week" className="flex flex-col gap-2">
          <h2 id="p-week" className="m-0 text-[20px] font-black tracking-[-0.03em]">
            This week
          </h2>
          <WeekCard person={v.person} summary={v.summary} isMe={v.is_me} />
          {v.is_me ? <p className="m-0 text-[12px] text-muted">Your crew sees this unless you turn off Your week in Sharing. Never calories.</p> : null}
        </section>
      ) : null}

      {activity.length > 0 ? (
        <section aria-labelledby="p-activity" className="flex flex-col gap-2">
          <h2 id="p-activity" className="m-0 text-[20px] font-black tracking-[-0.03em]">
            Lately
          </h2>
          {activity.slice(0, 6).map((it) => (
            <FeedCard key={it.id} item={it} meId={v.is_me ? v.person.id : ""} onCheer={cheer} />
          ))}
        </section>
      ) : null}

      {total === 0 ? (
        <p className="m-0 rounded-card border-[1.5px] border-dashed border-dash p-4 text-[15px] text-muted">
          {v.is_me
            ? "You haven't shared anything yet. Tap the lock on a workout, meal or routine and pick Friends or Everyone."
            : "Nothing shared yet. When they open up a workout, meal or routine, it shows up here."}
        </p>
      ) : (
        sections
          .filter((s) => s.items.length > 0)
          .map((s) => (
            <section key={s.kind} aria-labelledby={`p-${s.kind}`} className="flex flex-col gap-2">
              <h2 id={`p-${s.kind}`} className="m-0 text-[20px] font-black tracking-[-0.03em]">
                {KIND_LABEL[s.kind]} <span className="text-[13px] font-semibold text-muted">{s.items.length}</span>
              </h2>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {s.items.map((it) => (
                  <li key={it.id}>
                    <ShopCard item={it} showCreator={false} />
                  </li>
                ))}
              </ul>
            </section>
          ))
      )}

      {v.is_friend ? (
        <FriendMenu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          id={v.person.id}
          name={v.person.name}
          notify={v.notify_workouts ?? true}
          onNotify={(n) => res.setData((prev) => ({ ...(prev ?? v), notify_workouts: n }))}
        />
      ) : null}
    </main>
  )
}

/** Per-friend settings: workout pushes and removing them. */
function FriendMenu({
  open,
  onClose,
  id,
  name,
  notify,
  onNotify,
}: {
  open: boolean
  onClose: () => void
  id: string
  name: string
  notify: boolean
  onNotify: (n: boolean) => void
}) {
  const router = useRouter()
  const [removing, setRemoving] = useState(false)
  const [confirm, setConfirm] = useState(false)

  async function setNotify(n: boolean) {
    onNotify(n)
    try {
      await api.patch<FriendResponse>(`friends/${seg(id)}`, { notify_workouts: n })
    } catch (err) {
      onNotify(!n)
      toast.error(errorMessage(err))
    }
  }

  async function remove() {
    if (!confirm) {
      setConfirm(true)
      return
    }
    setRemoving(true)
    try {
      await api.del(`friends/${seg(id)}`)
      toast.success(`You and ${name} aren't friends any more`)
      onClose()
      router.replace("/friends")
    } catch (err) {
      toast.error(errorMessage(err))
      setRemoving(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={name}>
      <div className="flex flex-col gap-3">
        <div className="flex min-h-[56px] items-center gap-3 rounded-tile bg-white px-3.5">
          <span id={`notify-${id}`} className="flex flex-1 flex-col py-2">
            <span className="text-[15px] font-semibold">Ping me when they train</span>
            <span className="text-[12px] text-muted">When {name} hits the gym or finishes a workout</span>
          </span>
          <Switch checked={notify} onChange={setNotify} labelledBy={`notify-${id}`} />
        </div>
        <Button variant="danger" size="md" onClick={remove} loading={removing}>
          {confirm ? `Tap again to remove ${name}` : "Remove friend"}
        </Button>
      </div>
    </Sheet>
  )
}
