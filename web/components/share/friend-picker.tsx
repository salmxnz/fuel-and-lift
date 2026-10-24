"use client"

import Link from "next/link"
import { Avatar, DashedNote, Skeleton } from "@/components/ui/primitives"
import { CheckIcon } from "@/components/ui/icons"
import type { Entry, Friend, ShareStatus } from "@/lib/api/types"
import { cn } from "@/lib/cn"

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name
}

/**
 * A row of friends to pick from (several at once). Picking draws a ring and a
 * check badge that scale in from just below full size, never from nothing.
 */
export function FriendPicker({
  friends,
  loading,
  selected,
  onToggle,
}: {
  friends: Friend[] | undefined
  loading: boolean
  selected: string[]
  onToggle: (id: string) => void
}) {
  if (loading) {
    return (
      <div className="flex gap-3" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex w-[64px] flex-col items-center gap-1.5">
            <Skeleton className="h-[52px] w-[52px] rounded-full" />
            <Skeleton className="h-3 w-10" />
          </div>
        ))}
      </div>
    )
  }
  if (!friends || friends.length === 0) {
    return (
      <DashedNote className="flex flex-col items-start gap-2">
        <span>Add a friend first, then you can share meals and workouts with them.</span>
        <Link href="/friends/add" className="font-semibold text-protein">
          Send a friend link
        </Link>
      </DashedNote>
    )
  }
  return (
    <div role="group" aria-label="Friends" className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto overscroll-x-contain px-4 pb-0.5">
      {friends.map((f) => {
        const on = selected.includes(f.id)
        return (
          <button
            key={f.id}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(f.id)}
            className="flex w-[68px] flex-none flex-col items-center gap-1.5 rounded-tile py-1 transition-transform duration-[160ms] ease-out active:scale-[0.97]"
          >
            <span className="relative flex h-[56px] w-[56px] items-center justify-center">
              {/* Ring: fades and grows into place around the avatar. */}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-0 rounded-full border-2 border-ink transition-[opacity,transform] duration-[160ms] ease-out",
                  on ? "scale-100 opacity-100" : "scale-[0.9] opacity-0"
                )}
              />
              <Avatar name={f.name} url={f.avatar_url} size={48} tone={on ? "pink" : "lilac"} />
              <span
                aria-hidden="true"
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-sheet bg-ink text-white",
                  "transition-[opacity,transform] duration-[160ms] ease-out",
                  on ? "scale-100 opacity-100" : "scale-[0.6] opacity-0"
                )}
              >
                <CheckIcon size={12} strokeWidth={3} />
              </span>
            </span>
            <span className={cn("max-w-full truncate text-[13px]", on ? "font-bold" : "text-muted")}>{firstName(f.name)}</span>
          </button>
        )
      })}
    </div>
  )
}

/** "Sam", "Sam and Ravi", "Sam, Ravi and Mia", "3 friends" (more than three). */
export function joinNames(names: string[]): string {
  if (names.length === 0) return ""
  if (names.length > 3) return `${names.length} friends`
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

/** "waiting", "added" or "said no thanks". */
export const STATUS_LABEL: Record<ShareStatus, string> = {
  pending: "waiting",
  accepted: "added",
  declined: "said no thanks",
}

/**
 * Who a meal of yours went to, as one line: "Split with Addy · waiting",
 * "Split 3 ways with Addy and Sam", "Shared with Addy and Sam". The status shows when everyone gave the same answer.
 */
export function shareSummary(entry: Pick<Entry, "shared_with" | "split_ways">): string | null {
  const list = entry.shared_with ?? []
  if (list.length === 0) return null
  const names = joinNames(list.map((f) => firstName(f.name)))
  // "2 ways" says nothing new when it went to one friend.
  const ways = entry.split_ways && entry.split_ways > 2 ? `${entry.split_ways} ways ` : ""
  const head = entry.split_ways ? `Split ${ways}with ${names}` : `Shared with ${names}`
  const one = list.every((f) => f.status === list[0].status)
  return one ? `${head} · ${STATUS_LABEL[list[0].status]}` : head
}

/** A friend's answer as a small pill: waiting, added or said no thanks. */
export function StatusPill({ status }: { status: ShareStatus }) {
  return (
    <span
      className={cn(
        "flex-none rounded-full px-2.5 py-[3px] text-[12px] font-semibold",
        status === "accepted" ? "bg-pink-soft text-ink" : status === "pending" ? "bg-chip text-ink-soft" : "bg-line-soft text-muted"
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}
