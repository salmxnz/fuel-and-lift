"use client"

import Link from "next/link"
import { Avatar } from "@/components/ui/primitives"
import { VisibilityBadge } from "@/components/community/visibility-select"
import { WeekStrip } from "@/components/gym/routines-section"
import type { ShopItem, ShopKind } from "@/lib/api/types"
import { kcal } from "@/lib/format"

export const KIND_LABEL: Record<ShopKind, string> = { routine: "Routines", template: "Workouts", meal: "Meals" }
export const KIND_ONE: Record<ShopKind, string> = { routine: "Routine", template: "Workout", meal: "Meal" }

export function listNames(names: string[], max = 3): string {
  if (names.length === 0) return ""
  return names.length > max ? `${names.slice(0, max).join(", ")} +${names.length - max}` : names.join(", ")
}

/** One-line summary of what's inside. */
export function itemSummary(it: ShopItem): string {
  switch (it.kind) {
    case "template":
      return it.names.length === 0 ? "No exercises yet" : `${it.names.length} exercise${it.names.length === 1 ? "" : "s"} · ${listNames(it.names)}`
    case "meal":
      return `${kcal(it.macros?.kcal)} kcal · ${kcal(it.macros?.protein_g)} g protein · ${listNames(it.names)}`
    case "routine": {
      const days = Object.values(it.days ?? {}).filter(Boolean).length
      return `${days} day${days === 1 ? "" : "s"} a week · ${listNames(it.names)}`
    }
  }
}

export function addsLabel(n: number): string {
  return n === 0 ? "New" : `${n} add${n === 1 ? "" : "s"}`
}

/** A Shop card: the item (opens its page) and its creator (opens their profile). */
export function ShopCard({ item, showCreator = true }: { item: ShopItem; showCreator?: boolean }) {
  return (
    <article className="flex flex-col gap-2.5 rounded-card bg-white p-3.5">
      <Link href={`/shop/${item.kind}/${item.id}`} className="flex min-w-0 flex-col gap-1.5 no-underline">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0 text-[16px] font-bold leading-[1.3]">{item.name}</span>
          <span className="flex-none text-[12px] font-semibold text-muted">{addsLabel(item.add_count)}</span>
        </span>
        <span className="line-clamp-2 text-[13px] text-muted">{itemSummary(item)}</span>
        {item.kind === "routine" && item.days ? <WeekStrip days={item.days} /> : null}
      </Link>
      {showCreator || item.visibility === "friends" || item.added || item.hidden ? (
        <div className="flex items-center gap-2">
          {showCreator ? (
            <Link href={`/people/${item.creator.id}`} className="flex min-h-[32px] min-w-0 items-center gap-2 no-underline">
              <Avatar name={item.creator.name} url={item.creator.avatar_url} size={24} />
              <span className="truncate text-[13px] font-semibold">{item.creator.name}</span>
            </Link>
          ) : null}
          <span className="ml-auto flex items-center gap-1.5">
            {item.added ? <span className="rounded-full bg-pink px-2 py-0.5 text-[11px] font-bold">Added</span> : null}
            {item.visibility === "friends" || item.hidden ? <VisibilityBadge visibility={item.visibility} hidden={item.hidden} /> : null}
          </span>
        </div>
      ) : null}
    </article>
  )
}
