"use client"

// Ideas for the meal you're adding: the same as last time, your usual, what
// would fill the gap today, and what your crew is eating (join them).

import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"
import { FoodIconTile } from "@/components/food/food-icon"
import { Avatar, Skeleton } from "@/components/ui/primitives"
import { errorMessage } from "@/lib/api/client"
import { logAgain } from "@/components/food/offline-log"
import type { Day, Entry, SuggestionsResponse } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { addDays } from "@/lib/dates"
import { kcal, num1 } from "@/lib/format"

export function MealSuggestions({
  date,
  slotId,
  mealLabel,
  describeHref,
  onLogged,
  onNavigate,
  title,
}: {
  date: string
  slotId: string | null
  mealLabel: string
  /** /log/describe with this meal's target, for "join them". */
  describeHref: (text: string) => string
  onLogged: (day: Day) => void
  onNavigate: () => void
  /** Shown on its own (Today): a white card with this heading, nothing when there are no ideas. */
  title?: React.ReactNode
}) {
  const framed = title != null
  const q = `suggestions?date=${date}${slotId ? `&meal_slot_id=${slotId}` : ""}`
  const res = useApi<SuggestionsResponse>(q)
  const [busy, setBusy] = useState<string | null>(null)

  async function again(e: Entry) {
    setBusy(e.id)
    try {
      const r = await logAgain({
        date,
        label: mealLabel,
        source: e,
        target: slotId ? { meal_slot_id: slotId } : { meal_name: mealLabel },
      })
      toast.success(`${e.name}, added. Easy.`)
      if (r) onLogged(r.day)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  if (res.loading) {
    if (framed) return null
    return (
      <div className="flex gap-2">
        <Skeleton className="h-[64px] flex-1 rounded-tile" />
        <Skeleton className="h-[64px] flex-1 rounded-tile" />
      </div>
    )
  }
  const s = res.data
  if (!s) return null
  const lastLabel = s.again_date === addDays(date, -1) ? "Same as yesterday" : "Same as last time"
  const empty = s.again.length + s.usual.length + s.friends.length === 0 && !s.gap

  if (empty) return null
  const chip = framed ? "bg-ground" : "bg-white"
  return (
    <div className={framed ? "flex flex-col gap-3 rounded-card bg-white p-4" : "flex flex-col gap-3"}>
      {framed ? title : null}
      {s.gap ? (
        <div className="flex flex-col gap-2 rounded-card bg-pink-soft p-3">
          <span className="text-[14px] font-extrabold">
            {s.gap.nutrient === "protein"
              ? `You're ${num1(s.gap.left)} g short on protein today 💪`
              : `${kcal(s.gap.left)} kcal still in the tank today`}
          </span>
          {s.gap.picks.length > 0 ? (
            <ChipRow entries={s.gap.picks} busy={busy} onPick={again} note={(e) => `${num1(e.protein_g)} g protein`} bg="bg-white" />
          ) : (
            <span className="text-[12.5px] text-ink-soft">Snap or describe something hearty and it&apos;s sorted.</span>
          )}
        </div>
      ) : null}

      {s.again.length > 0 ? (
        <Group title={lastLabel}>
          <ChipRow entries={s.again} busy={busy} onPick={again} bg={chip} />
        </Group>
      ) : null}

      {s.usual.length > 0 && !(framed && s.again.length > 0) ? (
        <Group title="Your usual">
          <ChipRow entries={s.usual} busy={busy} onPick={again} bg={chip} />
        </Group>
      ) : null}

      {s.friends.length > 0 ? (
        <Group title="Your crew today">
          <ul className={`m-0 flex list-none flex-col rounded-tile px-3 py-0.5 ${chip}`}>
            {s.friends.slice(0, framed ? 1 : 2).map((f) => (
              <li key={f.entry_id} className="flex min-h-[56px] items-center gap-2.5 border-b border-line-soft last:border-b-0">
                <Avatar name={f.person.name} url={f.person.avatar_url} size={34} tone="lilac" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[14px] font-bold">{f.person.name}</span>
                  <span className="truncate text-[12.5px] text-muted">
                    Had {f.name} · {f.meal_name}
                  </span>
                </span>
                <Link
                  href={describeHref(f.name)}
                  onClick={onNavigate}
                  className="flex min-h-9 flex-none items-center rounded-full bg-ink px-3 text-[13px] font-bold text-white no-underline"
                >
                  Join them
                </Link>
              </li>
            ))}
          </ul>
        </Group>
      ) : null}
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="m-0 text-[13px] font-semibold text-muted">{title}</h3>
      {children}
    </div>
  )
}

function ChipRow({
  entries,
  busy,
  onPick,
  note,
  bg = "bg-white",
}: {
  entries: Entry[]
  busy: string | null
  onPick: (e: Entry) => void
  note?: (e: Entry) => string
  bg?: string
}) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
      {entries.map((e) => (
        <button
          key={e.id}
          type="button"
          disabled={busy !== null}
          aria-busy={busy === e.id || undefined}
          onClick={() => onPick(e)}
          className={`flex min-h-[64px] w-[210px] flex-none items-center gap-2.5 rounded-tile ${bg} px-2.5 py-2 text-left text-ink transition-transform duration-150 ease-out active:scale-[0.97] disabled:opacity-60`}
        >
          <FoodIconTile icon={e.icon} origin={e.origin} size={44} />
          <span className="flex min-w-0 flex-col">
            <span className="line-clamp-2 text-[13.5px] font-bold leading-[1.25]">{e.name}</span>
            <span className="text-[12px] text-muted">{busy === e.id ? "Adding…" : note ? note(e) : `${kcal(e.kcal)} kcal · tap to add`}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
