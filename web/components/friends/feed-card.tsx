"use client"

// One item in the activity feed, on the Friends tab and on profiles.

import Link from "next/link"
import { Avatar } from "@/components/ui/primitives"
import { CheerIcon, DumbbellIcon, GlobeIcon, TrendIcon } from "@/components/ui/icons"
import { RewardIcon } from "@/components/progress/rewards-card"
import type { FeedItem } from "@/lib/api/types"
import { cn } from "@/lib/cn"
import { seg } from "@/lib/api/client"

const KIND_VERB: Record<FeedItem["kind"], string> = {
  workout_finished: "smashed a workout",
  record: "hit a new PR",
  weight_milestone: "hit a milestone",
  streak: "is on a streak",
  workout_started: "is at the gym",
  shared_item: "shared something",
}

export function FeedCard({
  item,
  meId,
  onCheer,
}: {
  item: FeedItem
  meId: string
  onCheer: (item: FeedItem) => void
}) {
  const mine = item.actor.id === meId
  const who = mine ? "You" : item.actor.name
  const url = typeof item.data.url === "string" ? item.data.url : null
  const canCheer = item.kind !== "workout_started" && item.kind !== "shared_item"

  return (
    <article
      className={cn(
        "flex flex-col gap-2.5 rounded-card bg-white p-3.5",
        item.kind === "record" && "ring-[1.5px] ring-pink",
        item.kind === "workout_started" && "bg-ink text-white"
      )}
    >
      <div className="flex items-center gap-2.5">
        <Link href={`/people/${seg(item.actor.id)}`} aria-label={`${item.actor.name}'s profile`} className="relative flex-none">
          <Avatar name={item.actor.name} url={item.actor.avatar_url} size={40} tone={mine ? "ink" : "lilac"} />
          {item.kind === "workout_started" ? (
            <span aria-hidden="true" className="live-dot absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-ink bg-pink" />
          ) : null}
        </Link>
        <div className="flex min-w-0 flex-1 flex-col">
          {item.kind === "streak" ? (
            <>
              <span className="text-[15px]">
                <strong>{who}</strong> {mine ? "are" : "is"} on a {typeof item.data.days === "number" ? `${item.data.days}-day` : ""} streak
              </span>
              <span className="text-[12px] text-muted">Days in a row with a meal or a workout</span>
            </>
          ) : item.kind === "workout_started" ? (
            <>
              <span className="text-[15px]">
                <strong>{who}</strong> {mine ? "are" : "is"} at the gym
              </span>
              <span className="text-[12px] text-night-muted">{typeof item.data.template === "string" ? item.data.template : "Training now"}</span>
            </>
          ) : (
            <>
              <span className="text-[15px]">
                <strong>{who}</strong> {KIND_VERB[item.kind]}
              </span>
              <span className="text-[12px] text-muted">{item.text}</span>
            </>
          )}
        </div>
        {item.kind === "record" ? (
          <span className="rounded-full bg-pink px-2 py-1 text-[12px] font-extrabold text-ink">PR</span>
        ) : item.kind === "streak" ? (
          <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-pink-soft">
            <RewardIcon name="fire" size={32} />
          </span>
        ) : item.kind === "workout_finished" ? (
          <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-ink text-pink">
            <DumbbellIcon size={20} strokeWidth={1.9} />
          </span>
        ) : item.kind === "shared_item" ? (
          <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-pink text-ink">
            <GlobeIcon size={18} />
          </span>
        ) : item.kind === "workout_started" ? null : (
          <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-mint text-protein">
            <TrendIcon size={20} />
          </span>
        )}
      </div>

      {item.kind === "workout_started" && !mine ? (
        <Link
          href={`/people/${seg(item.actor.id)}`}
          className="flex min-h-10 items-center justify-center rounded-[12px] bg-pink text-[14px] font-extrabold text-ink no-underline"
        >
          Train together
        </Link>
      ) : item.kind === "shared_item" && url ? (
        <Link href={url} className="self-start text-[13px] font-bold text-protein no-underline">
          Have a look
        </Link>
      ) : canCheer ? (
        mine ? (
          <span className="text-[12px] text-muted">{item.cheers > 0 ? `${item.cheers} cheer${item.cheers === 1 ? "" : "s"}` : "Cheers show up here"}</span>
        ) : (
          <button
            type="button"
            aria-pressed={item.cheered_by_me}
            onClick={() => onCheer(item)}
            className={cn(
              "cheer-btn flex min-h-9 items-center gap-1.5 self-start rounded-full px-3 text-[13px] font-semibold transition-[background-color,transform] duration-150 ease-out active:scale-[0.96]",
              item.cheered_by_me ? "bg-ink text-white" : "border border-line"
            )}
          >
            <CheerIcon size={16} className={item.cheered_by_me ? "text-pink" : undefined} />
            {item.cheered_by_me ? "Cheered" : "Cheer"}
            {item.cheers > 0 ? <span className={item.cheered_by_me ? "text-night-muted" : "text-muted"}>· {item.cheers}</span> : null}
          </button>
        )
      ) : null}
    </article>
  )
}
