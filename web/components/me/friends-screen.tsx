"use client"

import Link from "next/link"
import { useState, type CSSProperties } from "react"
import { toast } from "sonner"
import { displayName, useMe } from "@/components/me-context"
import { WeekCard } from "@/components/friends/week-card"
import { FeedCard } from "@/components/friends/feed-card"
import { Coin, Heart, Peach, Strawberry } from "@/components/landing/art"
import { Avatar, Button, ErrorCard, Skeleton } from "@/components/ui/primitives"
import { ChevronRightIcon, PlusIcon } from "@/components/ui/icons"
import { Sky, SkyTitle, SKY_ICON } from "@/components/ui/sky"
import { VisibilityIcon } from "@/components/community/visibility-select"
import { api, errorMessage, seg } from "@/lib/api/client"
import type { FeedItem, FeedItemResponse, FeedResponse, FriendsWeekResponse, InviteLinksResponse } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { cn } from "@/lib/cn"
import { relativeDay } from "@/lib/dates"
import { PasteInvite } from "./paste-invite"

/** The Friends tab: who's training now, everyone's week, then the feed. */
export function FriendsScreen() {
  const me = useMe()
  const feed = useApi<FeedResponse>("feed")
  const week = useApi<FriendsWeekResponse>("friends/week")
  const links = useApi<InviteLinksResponse>("invite-links")
  const [more, setMore] = useState<FeedItem[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [exhausted, setExhausted] = useState(false)

  const all = [...(feed.data?.items ?? []), ...more]
  // "At the gym now" lives in the sky, once per friend; the feed shows the rest.
  const training = all.filter((it, i, a) => it.kind === "workout_started" && it.actor.id !== me.user.id && a.findIndex((x) => x.kind === it.kind && x.actor.id === it.actor.id) === i)
  const items = all.filter((it) => it.kind !== "workout_started")
  const ref = links.data?.referrals

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
    const last = all[all.length - 1]
    if (!last) return
    setLoadingMore(true)
    try {
      const res = await api.get<FeedResponse>("feed", { before: last.created_at })
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
      <Sky className="pb-14">
        <SkyTitle title="Friends">
          <Link href="/sharing" aria-label="Sharing: what friends see" className={SKY_ICON}>
            <VisibilityIcon visibility="friends" size={20} />
          </Link>
          <Link href="/friends/add" aria-label="Add a friend" data-tour="add-friend" className={cn(SKY_ICON, "border-ink bg-ink text-white")}>
            <PlusIcon size={20} strokeWidth={2.2} />
          </Link>
        </SkyTitle>

        {training.length > 0 ? (
          <div className="mt-4 flex flex-col gap-2">
            <h2 className="m-0 flex items-center gap-2 text-[13px] font-bold text-protein">
              <span aria-hidden="true" className="live-dot h-2.5 w-2.5 rounded-full bg-protein" />
              At the gym right now
            </h2>
            <ul className="no-scrollbar -mx-4 m-0 flex list-none gap-2 overflow-x-auto px-4 pb-1">
              {training.map((t) => (
                <li key={t.id} className="flex-none">
                  <Link
                    href={`/people/${seg(t.actor.id)}`}
                    className="flex min-h-[60px] items-center gap-2.5 rounded-[18px] border border-white/85 bg-white/70 py-2 pl-2 pr-3.5 text-ink no-underline shadow-[0_6px_18px_rgba(168,47,97,0.12)] backdrop-blur-md"
                  >
                    <span className="relative">
                      <Avatar name={t.actor.name} url={t.actor.avatar_url} size={40} tone="lilac" />
                      <span aria-hidden="true" className="live-dot absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-protein" />
                    </span>
                    <span className="flex flex-col">
                      <span className="text-[14px] font-extrabold">{t.actor.name}</span>
                      <span className="text-[12px] text-muted">{typeof t.data.template === "string" ? t.data.template : "Training"} · join in</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div aria-hidden="true" className="relative mx-auto mt-1 h-[118px] w-[230px]">
            <Heart className="app-float absolute left-[43%] top-0 w-[30px]" style={{ "--t": "4.5s" } as CSSProperties} />
            <Peach className="absolute bottom-0 left-[6%] w-[104px]" />
            <Strawberry face className="absolute bottom-0 right-[8%] w-[88px]" />
          </div>
        )}

        <Link
          href="/friends/add"
          className="mt-3 flex flex-col gap-2 rounded-[18px] border border-white/85 bg-white/70 px-3.5 py-3 text-ink no-underline shadow-[inset_0_1px_0_#fff] backdrop-blur-md"
        >
          <span className="flex items-center justify-between text-[13px] font-extrabold">
            Bring 8 friends, get Pro forever
            <span className="text-protein">{ref ? `${Math.min(ref.joined, ref.needed)} of ${ref.needed}` : "…"}</span>
          </span>
          <span className="flex gap-1.5" aria-hidden="true">
            {Array.from({ length: ref?.needed ?? 8 }, (_, i) =>
              ref && i < ref.joined ? (
                <Coin key={i} className="aspect-square w-full max-w-[30px]" />
              ) : (
                <span
                  key={i}
                  className="flex aspect-square w-full max-w-[30px] items-center justify-center rounded-full border-[1.5px] border-dashed border-dash text-[10px] font-bold text-muted"
                >
                  {i + 1}
                </span>
              )
            )}
          </span>
        </Link>
      </Sky>

      <section aria-labelledby="this-week" className="flex flex-col gap-2">
        <h2 id="this-week" className="m-0 text-[20px] font-black tracking-[-0.03em]">
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
                No crew yet. Send a link and their week shows up here.
              </div>
            ) : (
              week.data.friends.map((f) => <WeekCard key={f.person.id} person={f.person} summary={f.summary} href={`/people/${seg(f.person.id)}`} />)
            )}
          </>
        )}
      </section>

      <section aria-labelledby="activity" className="flex flex-col gap-2">
        <h2 id="activity" className="m-0 mt-2 text-[20px] font-black tracking-[-0.03em]">
          What&apos;s happening
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
            Quiet so far. When your crew trains, shares or hits a PR, it lands here.
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.day} className="flex flex-col gap-2">
              <h3 className="m-0 mt-1 text-[13px] font-semibold text-muted">{g.day}</h3>
              {g.items.map((it) => (
                <FeedCard key={it.id} item={it} meId={me.user.id} onCheer={cheer} />
              ))}
            </div>
          ))
        )}
        {all.length >= 30 && !exhausted ? (
          <Button variant="outline" size="md" onClick={loadMore} loading={loadingMore}>
            Older stuff
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
