"use client"

import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"
import { displayName, useMe } from "@/components/me-context"
import { WeekCard } from "@/components/friends/week-card"
import { Avatar, Button, ErrorCard, PageHeader, Skeleton } from "@/components/ui/primitives"
import { CheerIcon, ChevronRightIcon, DumbbellIcon, PlusIcon, TrendIcon } from "@/components/ui/icons"
import { api, errorMessage, seg } from "@/lib/api/client"
import type { FeedItem, FeedItemResponse, FeedResponse, FriendsWeekResponse } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { cn } from "@/lib/cn"
import { relativeDay } from "@/lib/dates"
import { RewardIcon } from "@/components/progress/rewards-card"
import { PasteInvite } from "./paste-invite"

const KIND_VERB: Record<FeedItem["kind"], string> = {
  workout_finished: "worked out",
  record: "set a record",
  weight_milestone: "hit a milestone",
  streak: "is on a streak",
}

/** The Friends tab: everyone's week so far, then the activity feed. */
export function FriendsScreen() {
  const me = useMe()
  const feed = useApi<FeedResponse>("feed")
  const week = useApi<FriendsWeekResponse>("friends/week")
  const [more, setMore] = useState<FeedItem[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [exhausted, setExhausted] = useState(false)

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
        title="Friends"
        titleClassName="text-[30px]"
        right={
          <Link
            href="/friends/add"
            data-tour="add-friend"
            className="flex min-h-11 items-center gap-1.5 rounded-[12px] bg-ink px-3.5 text-[14px] font-bold text-white no-underline"
          >
            <PlusIcon size={16} strokeWidth={2.2} /> Add friend
          </Link>
        }
      />

      <section aria-labelledby="this-week" className="flex flex-col gap-2">
        <h2 id="this-week" className="m-0 text-[17px] font-extrabold">
          This week
        </h2>
        {week.error && !week.data ? (
          <ErrorCard message={week.error.message} onRetry={() => void week.reload()} />
        ) : !week.data ? (
          <>
            <Skeleton className="h-[118px] rounded-card" />
            <Skeleton className="h-[118px] rounded-card" />
          </>
        ) : (
          <>
            <WeekCard
              person={{ id: me.user.id, name: displayName(me), avatar_url: me.user.avatar_url }}
              summary={week.data.me}
              isMe
              href={`/people/${seg(me.user.id)}`}
            />
            {week.data.friends.length === 0 ? (
              <div className="rounded-card border-[1.5px] border-dashed border-dash p-4 text-[15px] text-muted">
                No friends yet. Send a link and you&apos;ll see how their week is going here.
              </div>
            ) : (
              week.data.friends.map((f) => (
                <WeekCard key={f.person.id} person={f.person} summary={f.summary} href={`/people/${seg(f.person.id)}`} />
              ))
            )}
          </>
        )}
      </section>

      <section aria-labelledby="activity" className="flex flex-col gap-2">
        <h2 id="activity" className="m-0 mt-2 text-[17px] font-extrabold">
          Activity
        </h2>
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
              <h3 className="m-0 mt-1 text-[13px] font-semibold text-muted">{g.day}</h3>
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
