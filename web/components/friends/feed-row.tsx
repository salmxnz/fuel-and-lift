"use client"

// One row of the Friends tab's "This week" card, as in the app proposal:
// a face, who and what, and a Cheer pill that turns plum with a little burst.

import Link from "next/link"
import { useState, type CSSProperties } from "react"
import type { FeedItem } from "@/lib/api/types"
import { cn } from "@/lib/cn"
import { seg } from "@/lib/api/client"
import { relativeDay } from "@/lib/dates"
import { FriendFace } from "./friend-face"

function what(item: FeedItem): string {
  switch (item.kind) {
    case "streak":
      return typeof item.data.days === "number" ? `On a ${item.data.days}-day streak 🔥` : "On a streak 🔥"
    case "record":
      return item.text.replace(/^New record: /, "New PR: ")
    case "shared_item":
      return item.text
    default:
      return item.text
  }
}

const BURST = ["#F6B8CA", "#C83E78", "#F2B48C", "#EE8FB0", "#F6B8CA", "#C83E78", "#F2B48C", "#EE8FB0"]

export function FeedRow({ item, meId, onCheer }: { item: FeedItem; meId: string; onCheer: (item: FeedItem) => void }) {
  const mine = item.actor.id === meId
  const url = typeof item.data.url === "string" ? item.data.url : null
  const [burst, setBurst] = useState(0)
  const day = relativeDay(item.created_at)

  return (
    <li className="grid grid-cols-[44px_1fr_auto] items-center gap-3 border-t border-line-soft py-3 first:border-t-0">
      <Link href={`/people/${seg(item.actor.id)}`} aria-label={`${item.actor.name}'s page`}>
        <FriendFace person={item.actor} size={44} />
      </Link>
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-[15px] font-extrabold">{mine ? "You" : item.actor.name}</span>
        <span className="text-[13px] leading-[1.35] text-muted">
          {url ? (
            <Link href={url} className="text-protein no-underline">
              {what(item)}
            </Link>
          ) : (
            what(item)
          )}
          {day !== "Today" ? ` · ${day}` : ""}
        </span>
      </div>
      {item.kind === "shared_item" ? null : mine ? (
        item.cheers > 0 ? (
          <span className="text-[13px] font-bold text-protein">
            {item.cheers} cheer{item.cheers === 1 ? "" : "s"}
          </span>
        ) : null
      ) : (
        <button
          type="button"
          aria-pressed={item.cheered_by_me}
          onClick={() => {
            if (!item.cheered_by_me) setBurst((b) => b + 1)
            onCheer(item)
          }}
          className={cn(
            "relative flex h-[38px] items-center gap-1.5 rounded-[12px] px-3 text-[14px] font-extrabold transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.96]",
            item.cheered_by_me ? "bg-ink text-white" : "bg-pink-soft text-ink"
          )}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            className={item.cheered_by_me ? "text-pink" : "text-protein"}
          >
            <path d="M12 21C6 16.5 3 13.4 3 9.5 3 6.5 5.4 4 8.3 4c1.6 0 2.9.8 3.7 2 .8-1.2 2.1-2 3.7-2C18.6 4 21 6.5 21 9.5c0 3.9-3 7-9 11.5z" />
          </svg>
          {item.cheered_by_me ? "Cheered" : "Cheer"}
          {burst > 0
            ? BURST.map((c, i) => {
                const a = (i / BURST.length) * Math.PI * 2
                return (
                  <span
                    key={`${burst}-${i}`}
                    aria-hidden="true"
                    className="cheer-burst absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full"
                    style={
                      {
                        background: c,
                        "--x": `${Math.round(Math.cos(a) * 30)}px`,
                        "--y": `${Math.round(Math.sin(a) * 24)}px`,
                      } as CSSProperties
                    }
                  />
                )
              })
            : null}
        </button>
      )}
    </li>
  )
}
