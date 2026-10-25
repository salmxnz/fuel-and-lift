"use client"

// The Friends tab, as in the app proposal: peach and strawberry in the sky,
// the 8-friends Pro card, then "This week" as one card of rows with Cheer.
// Friends training right now get their own card; everyone's week follows.

import Link from "next/link"
import { useState, type CSSProperties } from "react"
import { toast } from "sonner"
import { displayName, useMe } from "@/components/me-context"
import { WeekCard } from "@/components/friends/week-card"
import { PushBanner } from "@/components/pwa/push-banner"
import { FeedRow } from "@/components/friends/feed-row"
import { GymNowCard } from "@/components/friends/gym-now-card"
import { Coin, Heart, Peach, Strawberry } from "@/components/landing/art"
import { Avatar, Button, ErrorCard, Skeleton } from "@/components/ui/primitives"
import { Sky, SkyTitle, SKY_ICON } from "@/components/ui/sky"
import { VisibilityIcon } from "@/components/community/visibility-select"
import { api, errorMessage, seg } from "@/lib/api/client"
import type { FeedItem, FeedItemResponse, FeedResponse, FriendsWeekResponse, InviteLinksResponse } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { PasteInvite } from "./paste-invite"

export function FriendsScreen() {
  const me = useMe()
  const feed = useApi<FeedResponse>("feed")
  const week = useApi<FriendsWeekResponse>("friends/week")
  const links = useApi<InviteLinksResponse>("invite-links")
  const [more, setMore] = useState<FeedItem[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [exhausted, setExhausted] = useState(false)

  const all = [...(feed.data?.items ?? []), ...more]
  const items = all.filter((it) => it.kind !== "workout_started")
  const ref = links.data?.referrals
  const needed = ref?.needed ?? 8
  const joined = Math.min(ref?.joined ?? 0, needed)

  function replace(item: FeedItem) {
    feed.setData((prev) => ({
      items: (prev?.items ?? []).map((x) => (x.id === item.id ? item : x)),
    }))
    setMore((m) => m.map((x) => (x.id === item.id ? item : x)))
  }

  async function cheer(item: FeedItem) {
    replace({
      ...item,
      cheered_by_me: !item.cheered_by_me,
      cheers: item.cheers + (item.cheered_by_me ? -1 : 1),
    })
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
      const res = await api.get<FeedResponse>("feed", {
        before: last.created_at,
      })
      setMore((m) => [...m, ...res.items])
      if (res.items.length < 30) setExhausted(true)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      <Sky className="pb-2">
        <SkyTitle title="Friends">
          <Link href="/sharing" aria-label="Sharing: what friends see" className={SKY_ICON}>
            <VisibilityIcon visibility="friends" size={20} />
          </Link>
          <Link
            href="/me"
            aria-label="Me: profile and settings"
            className="relative z-10 flex h-11 w-11 flex-none items-center justify-center rounded-full"
          >
            <Avatar name={displayName(me)} url={me.user.avatar_url} size={42} tone="ink" />
          </Link>
        </SkyTitle>
        {/* The friend-joined email's pair, in the sky. */}
        <div aria-hidden="true" className="relative -mx-4 h-[170px]">
          <Heart className="app-float absolute left-[46%] top-[2px] w-[40px]" style={{ "--t": "4.5s" } as CSSProperties} />
          <Peach className="absolute bottom-[30px] left-[24%] w-[104px]" />
          <Strawberry face className="absolute bottom-[30px] right-[22%] w-[88px]" />
        </div>
      </Sky>

      <PushBanner />

      <GymNowCard items={all} />

      <section aria-label="Pro forever" className="flex flex-col rounded-card bg-white p-[18px]">
        <div className="flex justify-between text-[14px] font-extrabold">
          Invite friends, get Pro forever
          <span className="text-protein">{ref ? `${joined} of ${needed}` : ""}</span>
        </div>
        <ol className="m-0 mt-3 flex list-none gap-1.5 p-0" aria-label={`${joined} of ${needed} friends joined`}>
          {Array.from({ length: needed }, (_, i) => (
            <li key={i} className="aspect-square w-full max-w-[36px] flex-1">
              {i < joined ? (
                <Coin className="h-full w-full" />
              ) : (
                <span className="flex h-full w-full items-center justify-center rounded-full border-[1.5px] border-dashed border-dash text-[10px] font-bold text-muted">
                  {i + 1}
                </span>
              )}
            </li>
          ))}
        </ol>
        <div className="mt-3.5 flex items-center justify-between gap-3">
          <span className="text-[13px] leading-[1.35] text-muted">Links work once and last 14 days.</span>
          <Link
            href="/friends/add"
            data-tour="add-friend"
            className="flex h-11 flex-none items-center whitespace-nowrap rounded-[14px] bg-ink px-4 text-[15px] font-extrabold text-white no-underline transition-transform duration-150 ease-out active:scale-[0.97]"
          >
            Send a link
          </Link>
        </div>
      </section>

      <section aria-labelledby="this-week" className="flex flex-col gap-2.5">
        <h2 id="this-week" className="m-0 mt-2 text-[24px] font-black tracking-[-0.035em]">
          This week
        </h2>
        {feed.error && !feed.data ? (
          <ErrorCard message={feed.error.message} onRetry={() => void feed.reload()} />
        ) : feed.loading ? (
          <Skeleton className="h-[200px] rounded-card" />
        ) : items.length === 0 ? (
          <div className="rounded-card border-[1.5px] border-dashed border-dash p-4 text-[15px] text-muted">
            Quiet so far. When your crew trains, shares or hits a PR, it lands here.
          </div>
        ) : (
          <ul className="m-0 flex list-none flex-col rounded-card bg-white px-4 py-1.5">
            {items.map((it) => (
              <FeedRow key={it.id} item={it} meId={me.user.id} onCheer={cheer} />
            ))}
          </ul>
        )}
        {all.length >= 30 && !exhausted ? (
          <Button variant="outline" size="md" onClick={loadMore} loading={loadingMore}>
            Older stuff
          </Button>
        ) : null}
      </section>

      <section aria-labelledby="crew-week" className="flex flex-col gap-2.5">
        <h2 id="crew-week" className="m-0 mt-2 text-[24px] font-black tracking-[-0.035em]">
          Your crew&apos;s week
        </h2>
        {week.error && !week.data ? (
          <ErrorCard message={week.error.message} onRetry={() => void week.reload()} />
        ) : !week.data ? (
          <Skeleton className="h-[118px] rounded-card" />
        ) : (
          <>
            <WeekCard
              person={{
                id: me.user.id,
                name: displayName(me),
                avatar_url: me.user.avatar_url,
              }}
              summary={week.data.me}
              isMe
              href={`/people/${seg(me.user.id)}`}
            />
            {week.data.friends.map((f) => (
              <WeekCard key={f.person.id} person={f.person} summary={f.summary} href={`/people/${seg(f.person.id)}`} />
            ))}
          </>
        )}
      </section>

      <PasteInvite />
    </div>
  )
}
