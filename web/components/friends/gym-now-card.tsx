"use client"

// Friends training right now, as a plum card: tap someone to see their
// session and train together. Shown on Friends and Gym.

import Link from "next/link"
import { useMe } from "@/components/me-context"
import { seg } from "@/lib/api/client"
import type { FeedItem, FeedResponse } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { FriendFace } from "./friend-face"

/** Friends with a workout_started item, newest first, one per person. */
export function trainingNow(items: FeedItem[], meId: string): FeedItem[] {
  return items.filter(
    (it, i, a) => it.kind === "workout_started" && it.actor.id !== meId && a.findIndex((x) => x.kind === it.kind && x.actor.id === it.actor.id) === i
  )
}

export function GymNowCard({ items }: { items?: FeedItem[] }) {
  const me = useMe()
  const feed = useApi<FeedResponse>(items ? null : "feed")
  const training = trainingNow(items ?? feed.data?.items ?? [], me.user.id)
  if (training.length === 0) return null
  return (
    <section aria-labelledby="gym-now" className="flex flex-col gap-2.5 rounded-card bg-ink p-4 text-white">
      <h2 id="gym-now" className="m-0 flex items-center gap-2 text-[13px] font-bold text-pink">
        <span aria-hidden="true" className="live-dot h-2.5 w-2.5 rounded-full bg-pink" />
        At the gym right now
      </h2>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {training.map((t) => (
          <li key={t.id}>
            <Link
              href={`/people/${seg(t.actor.id)}`}
              className="flex items-center gap-3 rounded-[16px] bg-night-2 p-2.5 text-white no-underline transition-transform duration-150 ease-out active:scale-[0.98]"
            >
              <FriendFace person={t.actor} size={40} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-extrabold">{t.actor.name}</span>
                <span className="truncate text-[12.5px] text-night-muted">{typeof t.data.template === "string" ? t.data.template : "Training"}</span>
              </span>
              <span className="flex-none rounded-[12px] bg-pink px-3 py-2 text-[13px] font-extrabold text-ink">Train together</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
