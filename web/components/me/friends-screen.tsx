"use client"

import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"
import { useMe } from "@/components/me-context"
import { Avatar, Button, ErrorCard, PageHeader, Skeleton, Switch } from "@/components/ui/primitives"
import { CheerIcon, ChevronRightIcon, DumbbellIcon, PlusIcon, TrendIcon } from "@/components/ui/icons"
import { api, errorMessage, seg } from "@/lib/api/client"
import type { FeedItem, FeedItemResponse, FeedResponse, FriendResponse, FriendsResponse } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { cn } from "@/lib/cn"
import { formatDayMonth, relativeDay } from "@/lib/dates"
import { RewardIcon } from "@/components/progress/rewards-card"
import { PasteInvite } from "./paste-invite"

const KIND_VERB: Record<FeedItem["kind"], string> = {
  workout_finished: "worked out",
  record: "set a record",
  weight_milestone: "hit a milestone",
  streak: "is on a streak",
}

export function FriendsScreen() {
  const me = useMe()
  const feed = useApi<FeedResponse>("feed")
  const friends = useApi<FriendsResponse>("friends")
  const [more, setMore] = useState<FeedItem[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [exhausted, setExhausted] = useState(false)
  const [openFriend, setOpenFriend] = useState<string | null>(null)

  const items = [...(feed.data?.items ?? []), ...more]

  function replace(item: FeedItem) {
    feed.setData((prev) => ({ items: (prev?.items ?? []).map((x) => (x.id === item.id ? item : x)) }))
    setMore((m) => m.map((x) => (x.id === item.id ? item : x)))
  }

  async function cheer(item: FeedItem) {
    const optimistic = { ...item, cheered_by_me: !item.cheered_by_me, cheers: item.cheers + (item.cheered_by_me ? -1 : 1) }
    replace(optimistic)
    try {
      const res = item.cheered_by_me
        ? await api.del<FeedItemResponse>(`feed/${seg(item.id)}/cheer`)
        : await api.post<FeedItemResponse>(`feed/${seg(item.id)}/cheer`)
      if (res?.item) replace(res.item)
    } catch (err) {
      replace(item)
      toast.error(errorMessage(err))
    }
  }

  async function loadMore() {
    const last = items[items.length - 1]
    if (!last) return
    setLoadingMore(true)
    try {
      const res = await api.get<FeedResponse>("feed", { before: last.created_at })
      if (res.items.length === 0) setExhausted(true)
      setMore((m) => [...m, ...res.items])
      if (res.items.length < 30) setExhausted(true)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setLoadingMore(false)
    }
  }

  async function setNotify(id: string, notify: boolean) {
    friends.setData((prev) => ({ friends: (prev?.friends ?? []).map((f) => (f.id === id ? { ...f, notify_workouts: notify } : f)) }))
    try {
      const res = await api.patch<FriendResponse>(`friends/${seg(id)}`, { notify_workouts: notify })
      friends.setData((prev) => ({ friends: (prev?.friends ?? []).map((f) => (f.id === id ? res.friend : f)) }))
    } catch (err) {
      friends.setData((prev) => ({ friends: (prev?.friends ?? []).map((f) => (f.id === id ? { ...f, notify_workouts: !notify } : f)) }))
      toast.error(errorMessage(err))
    }
  }

  async function removeFriend(id: string, name: string) {
    try {
      await api.del(`friends/${seg(id)}`)
      friends.setData((prev) => ({ friends: (prev?.friends ?? []).filter((f) => f.id !== id) }))
      toast.success(`You and ${name} are no longer friends`)
      setOpenFriend(null)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  // Group the feed by day.
  const groups: { day: string; items: FeedItem[] }[] = []
  for (const it of items) {
    const day = relativeDay(it.created_at)
    const g = groups[groups.length - 1]
    if (g && g.day === day) g.items.push(it)
    else groups.push({ day, items: [it] })
  }

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        back="/me"
        backLabel="Back to Me"
        title="Friends"
        titleClassName="text-[26px]"
        right={
          <Link
            href="/friends/add"
            className="flex min-h-11 items-center gap-1.5 rounded-[12px] bg-ink px-3.5 text-[14px] font-bold text-white no-underline"
          >
            <PlusIcon size={16} strokeWidth={2.2} /> Add friend
          </Link>
        }
      />

      <section aria-label="Activity" className="flex flex-col gap-2">
        {feed.error && !feed.data ? (
          <ErrorCard message={feed.error.message} onRetry={() => void feed.reload()} />
        ) : feed.loading ? (
          <>
            <Skeleton className="h-[96px] rounded-card" />
            <Skeleton className="h-[72px] rounded-card" />
          </>
        ) : items.length === 0 ? (
          <div className="rounded-card border-[1.5px] border-dashed border-dash p-4 text-[15px] text-muted">
            No activity yet. When friends work out or set records, it shows up here.
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.day} className="flex flex-col gap-2">
              <h2 className="m-0 mt-1 text-[13px] font-semibold text-muted">{g.day}</h2>
              {g.items.map((it) => {
                const mine = it.actor.id === me.user.id
                return (
                  <article
                    key={it.id}
                    className={cn("flex flex-col gap-2.5 rounded-card bg-white p-3.5", mine && it.kind === "record" && "border-[1.5px] border-pink")}
                  >
                    <div className="flex items-center gap-2.5">
                      <Avatar name={it.actor.name} url={it.actor.avatar_url} size={40} tone={mine ? "ink" : "lilac"} />
                      <div className="flex min-w-0 flex-1 flex-col">
                        {it.kind === "streak" ? (
                          <>
                            <span className="text-[15px]">
                              <strong>{mine ? "You" : it.actor.name}</strong> {mine ? "are" : "is"} on a{" "}
                              {typeof it.data.days === "number" ? `${it.data.days}-day` : ""} streak
                            </span>
                            <span className="text-[12px] text-muted">Days in a row with a meal or a workout</span>
                          </>
                        ) : (
                          <>
                            <span className="text-[15px]">
                              <strong>{mine ? "You" : it.actor.name}</strong> {KIND_VERB[it.kind]}
                            </span>
                            <span className="text-[12px] text-muted">{it.text}</span>
                          </>
                        )}
                      </div>
                      {it.kind === "record" ? (
                        <span className="rounded-full bg-pink px-2 py-1 text-[12px] font-extrabold">PR</span>
                      ) : it.kind === "streak" ? (
                        <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-pink-soft">
                          <RewardIcon name="fire" size={32} />
                        </span>
                      ) : it.kind === "workout_finished" ? (
                        <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-ink text-pink">
                          <DumbbellIcon size={20} strokeWidth={1.9} />
                        </span>
                      ) : (
                        <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-mint text-protein">
                          <TrendIcon size={20} />
                        </span>
                      )}
                    </div>
                    {mine ? (
                      <span className="text-[12px] text-muted">
                        {it.cheers > 0 ? `${it.cheers} cheer${it.cheers === 1 ? "" : "s"}` : "Cheers appear here"}
                      </span>
                    ) : (
                      <button
                        type="button"
                        aria-pressed={it.cheered_by_me}
                        onClick={() => cheer(it)}
                        className={cn(
                          "flex min-h-9 items-center gap-1.5 self-start rounded-full px-3 text-[13px] font-semibold",
                          it.cheered_by_me ? "border border-ink bg-pink" : "border border-line"
                        )}
                      >
                        <CheerIcon size={16} />
                        {it.cheered_by_me ? "Cheered" : "Cheer"}
                        {it.cheers > 0 ? <span className="text-muted">· {it.cheers}</span> : null}
                      </button>
                    )}
                  </article>
                )
              })}
            </div>
          ))
        )}
        {items.length >= 30 && !exhausted ? (
          <Button variant="outline" size="md" onClick={loadMore} loading={loadingMore}>
            Older activity
          </Button>
        ) : null}
      </section>

      <section aria-label="Your friends" className="flex flex-col rounded-card bg-white px-3.5 py-0.5">
        {friends.error && !friends.data ? (
          <p className="m-0 py-3 text-[14px] text-danger">{friends.error.message}</p>
        ) : friends.loading ? (
          <Skeleton className="my-3 h-10" />
        ) : (friends.data?.friends.length ?? 0) === 0 ? (
          <p className="m-0 py-3.5 text-[14px] text-muted">No friends yet. Send a link and they&apos;re added when they join.</p>
        ) : (
          friends.data!.friends.map((f) => {
            const labelId = `friend-${f.id}`
            const open = openFriend === f.id
            return (
              <div key={f.id} className="flex flex-col border-b border-line-soft last:border-b-0">
                <div className="flex min-h-[60px] items-center gap-2.5">
                  <Avatar name={f.name} url={f.avatar_url} size={36} />
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenFriend(open ? null : f.id)}
                    className="flex min-h-11 flex-1 flex-col justify-center text-left"
                  >
                    <span id={labelId} className="text-[15px] font-bold">
                      {f.name}
                    </span>
                    <span className="text-[12px] text-muted">
                      {f.last_workout_on ? `Last workout ${formatDayMonth(f.last_workout_on)}` : "Notify me when they work out"}
                    </span>
                  </button>
                  <Switch
                    checked={f.notify_workouts}
                    onChange={(v) => setNotify(f.id, v)}
                    label={`Notify me when ${f.name} works out`}
                  />
                </div>
                {open ? (
                  <div className="flex flex-col gap-2 pb-3">
                    <Link
                      href={`/people/${f.id}`}
                      className="flex min-h-[44px] items-center justify-between rounded-tile bg-ground px-3 text-[14px] font-semibold no-underline"
                    >
                      See their routines and meals <ChevronRightIcon size={16} className="text-muted" />
                    </Link>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] text-muted">Friends since {formatDayMonth(f.since)}</span>
                      <Button variant="danger" size="sm" onClick={() => removeFriend(f.id, f.name)}>
                        Remove friend
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })
        )}
      </section>

      <Link
        href="/friends/add"
        className="flex min-h-[52px] items-center justify-center gap-2 rounded-btn border-[1.5px] border-dashed border-dash text-[14px] font-semibold no-underline"
      >
        Send a friend link <ChevronRightIcon size={16} />
      </Link>

      <PasteInvite />
    </div>
  )
}
