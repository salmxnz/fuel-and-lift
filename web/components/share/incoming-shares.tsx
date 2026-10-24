"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useRouter } from "next/navigation"
import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Sheet } from "@/components/ui/sheet"
import { Avatar, Button, Chip } from "@/components/ui/primitives"
import { DumbbellIcon } from "@/components/ui/icons"
import { api, errorMessage, seg } from "@/lib/api/client"
import type {
  Day,
  EntryDayResponse,
  MealSlot,
  Routine,
  RoutineResponse,
  Share,
  SharesResponse,
  Template,
  TemplateResponse,
} from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { addDays, formatDayMonth, todayISO } from "@/lib/dates"
import { kcal } from "@/lib/format"
import { EASE_OUT } from "@/lib/motion"
import { firstName } from "./friend-picker"

const PART: Record<number, string> = { 2: "half", 3: "third", 4: "quarter" }

/** "Your half", "Your third", "Your 1/5", or "Same meal" when shared whole. */
export function partLabel(ways: number | null): string {
  if (!ways) return "Same meal"
  return `Your ${PART[ways] ?? `1/${ways}`}`
}

/** "today", "yesterday" or "23 Oct". */
export function dayLabel(date: string): string {
  const today = todayISO()
  if (date === today) return "today"
  if (date === addDays(today, -1)) return "yesterday"
  return formatDayMonth(date)
}

/**
 * Shares fold open when they arrive and fold shut when answered, so what's
 * below glides instead of jumping. The ones already waiting when the list
 * loads just appear: they shouldn't push the screen down on every visit.
 */
function ShareList({
  shares,
  loaded,
  label,
  children,
}: {
  shares: Share[]
  /** The list has loaded (from the cache or the network). */
  loaded: boolean
  label: string
  children: (s: Share) => ReactNode
}) {
  const reduce = useReducedMotion()
  const [initialIds, setInitialIds] = useState<Set<string> | null>(null)
  if (loaded && initialIds === null) setInitialIds(new Set(shares.map((s) => s.id)))
  return (
    <section aria-label={label} className="-mb-3.5 flex flex-col">
      <AnimatePresence initial={false}>
        {shares.map((s, i) => (
          <motion.div
            key={s.id}
            className="overflow-hidden"
            initial={initialIds?.has(s.id) ? false : reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, height: "auto" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0, transition: { duration: 0.18, ease: EASE_OUT } }}
            transition={{ duration: 0.24, ease: EASE_OUT, delay: Math.min(i, 4) * 0.04 }}
          >
            <div className="pb-3.5">{children(s)}</div>
          </motion.div>
        ))}
      </AnimatePresence>
    </section>
  )
}

function ShareCard({
  share,
  title,
  detail,
  icon,
  accept,
  onAccept,
  onDecline,
  busy,
}: {
  share: Share
  title: ReactNode
  detail: string
  icon?: ReactNode
  accept: string
  onAccept: () => void
  onDecline: () => void
  busy: boolean
}) {
  return (
    <article className="flex flex-col gap-3 rounded-card border-[1.5px] border-pink bg-white p-3.5">
      <div className="flex items-center gap-2.5">
        <Avatar name={share.from.name} url={share.from.avatar_url} size={40} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] leading-[1.35]">{title}</span>
          <span className="truncate text-[13px] text-muted">{detail}</span>
        </div>
        {icon}
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Button size="sm" onClick={onAccept} loading={busy}>
          {accept}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDecline} disabled={busy} className="text-muted">
          No thanks
        </Button>
      </div>
    </article>
  )
}

function useShares(kind: Share["kind"]) {
  const res = useApi<SharesResponse>(`shares?kind=${kind}`)
  const shares = res.data?.shares ?? []
  const remove = (id: string) => res.setData((prev) => ({ shares: (prev?.shares ?? []).filter((s) => s.id !== id) }))

  async function decline(s: Share) {
    remove(s.id)
    try {
      await api.del(`shares/${seg(s.id)}`)
    } catch (err) {
      res.setData((prev) => ({ shares: [s, ...(prev?.shares ?? [])] }))
      toast.error(errorMessage(err))
    }
  }
  return { shares, loaded: res.data !== undefined, remove, decline }
}

// ------------------------------------------------------------ Meals (Today)

export function IncomingMeals({
  slots,
  viewing,
  onDayChange,
  onGoTo,
}: {
  slots: MealSlot[]
  /** The date on screen: a meal logged there updates it in place. */
  viewing: string
  onDayChange: (day: Day) => void
  onGoTo: (date: string) => void
}) {
  const { shares, loaded, remove, decline } = useShares("meal")
  const [adding, setAdding] = useState<Share | null>(null)

  return (
    <>
      <ShareList shares={shares} loaded={loaded} label="Meals friends shared with you">
        {(s) => (
          <ShareCard
            share={s}
            title={
              <>
                <strong>{firstName(s.from.name)}</strong> {s.split_ways ? "split" : "shared"} <strong>{s.meal!.name}</strong> with you
              </>
            }
            detail={`${partLabel(s.split_ways)} · ${kcal(s.meal!.kcal)} kcal · ${s.meal!.meal_name}, ${dayLabel(s.meal!.date)}`}
            accept="Add to my day"
            onAccept={() => setAdding(s)}
            onDecline={() => void decline(s)}
            busy={false}
          />
        )}
      </ShareList>
      <AcceptMealSheet
        share={adding}
        slots={slots}
        onClose={() => setAdding(null)}
        onAdded={(share, res, slotName) => {
          setAdding(null)
          remove(share.id)
          const elsewhere = res.day.date !== viewing
          if (!elsewhere) onDayChange(res.day)
          toast.success(`Added to ${slotName.toLowerCase()}${elsewhere ? `, ${dayLabel(res.day.date)}` : ""}`, {
            action: elsewhere ? { label: "View", onClick: () => onGoTo(res.day.date) } : undefined,
          })
        }}
      />
    </>
  )
}

export function AcceptMealSheet({
  share,
  slots,
  onClose,
  onAdded,
}: {
  share: Share | null
  slots: MealSlot[]
  onClose: () => void
  onAdded: (share: Share, res: EntryDayResponse, slotName: string) => void
}) {
  const meal = share?.meal
  return (
    <Sheet
      open={!!meal}
      onClose={onClose}
      title={meal ? `Add ${meal.name}` : "Add"}
      description={
        share && meal
          ? `${partLabel(share.split_ways)} from ${firstName(share.from.name)}: ${kcal(meal.kcal)} kcal, ${kcal(meal.protein_g)} g protein.`
          : undefined
      }
    >
      {share && meal ? <AcceptMealForm key={share.id} share={share} slots={slots} onAdded={onAdded} /> : null}
    </Sheet>
  )
}

function AcceptMealForm({
  share,
  slots,
  onAdded,
}: {
  share: Share
  slots: MealSlot[]
  onAdded: (share: Share, res: EntryDayResponse, slotName: string) => void
}) {
  const meal = share.meal!
  const today = todayISO()
  const date = meal.date > today ? today : meal.date
  // Same meal name as the sender's ("Dinner") when there is one.
  const match = slots.find((s) => s.name.toLowerCase() === meal.meal_name.toLowerCase())
  const [slotId, setSlotId] = useState<string | null>(match?.id ?? slots[0]?.id ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const slot = slots.find((s) => s.id === slotId)
  const slotName = slot?.name ?? meal.meal_name

  async function add() {
    setBusy(true)
    setError(null)
    try {
      const res = await api.post<EntryDayResponse>(
        `shares/${seg(share.id)}/accept`,
        slot ? { meal_slot_id: slot.id, date } : { meal_name: meal.meal_name.slice(0, 30), date }
      )
      onAdded(share, res, slotName)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {meal.items.length > 0 ? (
        <ul className="m-0 flex list-none flex-col rounded-card bg-white px-3.5 py-1">
          {meal.items.map((it, i) => (
            <li key={i} className="flex min-h-[44px] items-center justify-between gap-3 border-b border-line-soft text-[14px] last:border-b-0">
              <span className="min-w-0 truncate">
                {it.name}
                {it.grams != null ? <span className="text-muted"> · {kcal(it.grams)} g</span> : null}
              </span>
              <span className="flex-none font-semibold tabular-nums">{kcal(it.kcal)} kcal</span>
            </li>
          ))}
        </ul>
      ) : null}

      {slots.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span id="accept-meal" className="text-[13px] font-semibold text-muted">
            Which meal, {dayLabel(date)}?
          </span>
          <div role="radiogroup" aria-labelledby="accept-meal" className="flex flex-wrap gap-1.5">
            {slots.map((s) => (
              <Chip key={s.id} selected={s.id === slotId} onClick={() => setSlotId(s.id)}>
                {s.name}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="m-0 text-[14px] font-semibold text-danger">
          {error}
        </p>
      ) : null}
      <Button onClick={add} loading={busy}>
        Add to {slotName.toLowerCase()}
      </Button>
    </div>
  )
}

// ------------------------------------------------------------ Templates (Gym)

export function IncomingTemplates({ onAdded }: { onAdded: (t: Template) => void }) {
  const router = useRouter()
  const { shares, loaded, remove, decline } = useShares("template")
  const [busy, setBusy] = useState<string | null>(null)

  async function accept(s: Share) {
    setBusy(s.id)
    try {
      const res = await api.post<TemplateResponse>(`shares/${seg(s.id)}/accept`, {})
      remove(s.id)
      onAdded(res.template)
      toast.success(`${res.template.name} is in your templates`, {
        action: { label: "Open", onClick: () => router.push(`/gym/templates/${res.template.id}`) },
      })
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <ShareList shares={shares} loaded={loaded} label="Workouts friends shared with you">
      {(s) => {
        const ex = s.template!.exercises
        const summary =
          ex.length === 0 ? "No exercises yet" : ex.length > 3 ? `${ex.slice(0, 3).join(", ")} +${ex.length - 3}` : ex.join(", ")
        return (
          <ShareCard
            share={s}
            title={
              <>
                <strong>{firstName(s.from.name)}</strong> shared <strong>{s.template!.name}</strong>
              </>
            }
            detail={summary}
            icon={
              <span aria-hidden="true" className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-ink text-pink">
                <DumbbellIcon size={20} strokeWidth={1.9} />
              </span>
            }
            accept="Add to my templates"
            onAccept={() => void accept(s)}
            onDecline={() => void decline(s)}
            busy={busy === s.id}
          />
        )
      }}
    </ShareList>
  )
}

// ------------------------------------------------------------ Routines (Gym)

export function IncomingRoutines({ onAdded }: { onAdded: (r: Routine) => void }) {
  const router = useRouter()
  const { shares, loaded, remove, decline } = useShares("routine")
  const [busy, setBusy] = useState<string | null>(null)

  async function accept(s: Share) {
    setBusy(s.id)
    try {
      const res = await api.post<RoutineResponse>(`shares/${seg(s.id)}/accept`, {})
      remove(s.id)
      onAdded(res.routine)
      toast.success(`${res.routine.name} is in your routines`, {
        action: { label: "Open", onClick: () => router.push(`/gym/routines/${res.routine.id}`) },
      })
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <ShareList shares={shares} loaded={loaded} label="Routines friends shared with you">
      {(s) => {
        const r = s.routine!
        const trained = Object.values(r.days).filter((d) => d != null).length
        return (
          <ShareCard
            share={s}
            title={
              <>
                <strong>{firstName(s.from.name)}</strong> shared the routine <strong>{r.name}</strong>
              </>
            }
            detail={`${trained} day${trained === 1 ? "" : "s"} a week · ${r.workouts.map((w) => w.name).join(", ")}`}
            icon={
              <span aria-hidden="true" className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-ink text-pink">
                <DumbbellIcon size={20} strokeWidth={1.9} />
              </span>
            }
            accept="Add to my routines"
            onAccept={() => void accept(s)}
            onDecline={() => void decline(s)}
            busy={busy === s.id}
          />
        )
      }}
    </ShareList>
  )
}
