"use client"

import Link from "next/link"
import { MealSuggestions } from "./suggestions"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Sheet } from "@/components/ui/sheet"
import { Chip, Skeleton, TextInput } from "@/components/ui/primitives"
import {
  BarcodeIcon,
  CameraIcon,
  ChatIcon,
  ChevronRightIcon,
  ListIcon,
  StoreIcon,
} from "@/components/ui/icons"
import { api, errorMessage, seg } from "@/lib/api/client"
import type { Day, EntryDayResponse, MealSlotsResponse, SavedMealsResponse } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { kcal } from "@/lib/format"
import { slotForNow, targetBody, targetQuery, type MealTarget } from "@/lib/meal-target"
import { todayISO } from "@/lib/dates"

export type FoodSheetTarget = { mealSlotId?: string | null; mealName?: string | null; label?: string }

/** Add-Food.dc.html: pick the meal, then how to log it. */
export function AddFoodSheet({
  open,
  target,
  date,
  onClose,
  onLogged,
}: {
  open: boolean
  target?: FoodSheetTarget
  date: string
  onClose: () => void
  onLogged: (day: Day) => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Add food">
      {open ? <AddFoodBody target={target} date={date} onClose={onClose} onLogged={onLogged} /> : null}
    </Sheet>
  )
}

function AddFoodBody({
  target,
  date,
  onClose,
  onLogged,
}: {
  target?: FoodSheetTarget
  date: string
  onClose: () => void
  onLogged: (day: Day) => void
}) {
  const slots = useApi<MealSlotsResponse>("meal-slots")
  const saved = useApi<SavedMealsResponse>("saved-meals")
  const [picked, setPicked] = useState<{ slotId: string | null; oneOff: string | null } | null>(
    target?.mealSlotId
      ? { slotId: target.mealSlotId, oneOff: null }
      : target?.mealName
        ? { slotId: null, oneOff: target.mealName }
        : null
  )
  const [newMealOpen, setNewMealOpen] = useState(false)
  const [newMealName, setNewMealName] = useState("")
  const [logging, setLogging] = useState<string | null>(null)

  const sortedSlots = useMemo(
    () => [...(slots.data?.meal_slots ?? [])].sort((a, b) => a.position - b.position),
    [slots.data]
  )

  // Default to the meal that fits the time of day (only for today).
  const fallbackSlot = useMemo(() => {
    if (sortedSlots.length === 0) return null
    return date === todayISO() ? slotForNow(sortedSlots) : sortedSlots[0]
  }, [sortedSlots, date])

  const selection = picked ?? (fallbackSlot ? { slotId: fallbackSlot.id, oneOff: null } : null)

  const mealTarget: MealTarget | null = selection
    ? {
        date,
        mealSlotId: selection.slotId,
        mealName: selection.oneOff,
        label: selection.oneOff ?? sortedSlots.find((s) => s.id === selection.slotId)?.name ?? target?.label ?? "Meal",
      }
    : null

  const q = mealTarget ? `?${targetQuery(mealTarget)}` : ""

  async function logSaved(id: string, name: string) {
    if (!mealTarget) return
    setLogging(id)
    try {
      const res = await api.post<EntryDayResponse>(`days/${seg(date)}/saved-meals/${seg(id)}`, {
        ...targetBody(mealTarget),
        addon_ids: [],
      })
      onLogged(res.day)
      toast.success(`${name} in ${mealTarget.label}. Sorted.`)
      onClose()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setLogging(null)
    }
  }

  useEffect(() => {
    if (!newMealOpen) return
    const el = document.getElementById("new-meal-name")
    el?.focus()
  }, [newMealOpen])

  const recents = (saved.data?.saved_meals ?? []).slice(0, 4)
  const disabled = !mealTarget

  return (
    <>
      <div role="radiogroup" aria-label="Which meal" className="flex flex-wrap gap-1.5">
        {slots.loading ? (
          <>
            <Skeleton className="h-[34px] w-20 rounded-full" />
            <Skeleton className="h-[34px] w-16 rounded-full" />
            <Skeleton className="h-[34px] w-[72px] rounded-full" />
          </>
        ) : null}
        {sortedSlots.map((s) => (
          <Chip
            key={s.id}
            selected={selection?.slotId === s.id}
            onClick={() => setPicked({ slotId: s.id, oneOff: null })}
          >
            {s.name}
          </Chip>
        ))}
        {selection?.oneOff ? (
          <Chip selected onClick={() => setNewMealOpen(true)}>
            {selection.oneOff}
          </Chip>
        ) : null}
        <Chip role="button" dashed onClick={() => setNewMealOpen((v) => !v)}>
          + New meal
        </Chip>
      </div>
      {slots.error ? <p className="m-0 text-[13px] text-danger">{slots.error.message}</p> : null}

      {newMealOpen ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const name = newMealName.trim()
            if (!name) return
            setPicked({ slotId: null, oneOff: name.slice(0, 60) })
            setNewMealOpen(false)
          }}
        >
          <label htmlFor="new-meal-name" className="sr-only">
            Name of the meal, just for today
          </label>
          <TextInput
            id="new-meal-name"
            placeholder="Late snack"
            value={newMealName}
            maxLength={60}
            onChange={(e) => setNewMealName(e.target.value)}
          />
          <button type="submit" className="min-h-[48px] flex-none rounded-tile bg-ink px-4 text-[15px] font-bold text-white">
            Use
          </button>
        </form>
      ) : null}

      {mealTarget ? (
        <MealSuggestions
          key={`${mealTarget.mealSlotId ?? mealTarget.mealName}-${date}`}
          date={date}
          slotId={mealTarget.mealSlotId}
          mealLabel={mealTarget.label}
          describeHref={(text) => `/log/describe${q}${q ? "&" : "?"}text=${encodeURIComponent(text)}`}
          onLogged={(day) => {
            onLogged(day)
            onClose()
          }}
          onNavigate={onClose}
        />
      ) : null}

      <Link
        href={`/log/photo${q}`}
        aria-disabled={disabled}
        onClick={(e) => (disabled ? e.preventDefault() : onClose())}
        className="flex items-center gap-3.5 rounded-[20px] border border-[rgba(46,26,36,0.12)] bg-pink p-4 text-ink no-underline"
      >
        <span className="flex h-[54px] w-[54px] flex-none items-center justify-center rounded-btn bg-ink text-pink">
          <CameraIcon size={26} />
        </span>
        <span className="flex flex-1 flex-col gap-0.5">
          <span className="text-[18px] font-extrabold">Take a photo</span>
          <span className="text-[13px]">I find each item, you check the numbers</span>
        </span>
      </Link>

      <div className="grid grid-cols-2 gap-2">
        <Tile href={`/saved-meals${q}${q ? "&" : "?"}pick=1`} onNavigate={onClose} disabled={disabled} icon={<ListIcon size={24} />} title="My meals" sub="Saved meals and add-ons" />
        <Tile href={`/log/restaurant${q}`} onNavigate={onClose} disabled={disabled} icon={<StoreIcon size={24} />} title="Restaurant" sub="McDonald's, KFC and more" />
        <Tile href={`/log/describe${q}`} onNavigate={onClose} disabled={disabled} icon={<ChatIcon size={24} />} title="Describe it" sub="Type or say what you ate" />
        <Tile href={`/log/barcode${q}`} onNavigate={onClose} disabled={disabled} icon={<BarcodeIcon size={24} />} title="Scan barcode" sub="Packaged food" />
      </div>

      <Link
        href={`/log/manual${q}`}
        aria-disabled={disabled}
        onClick={(e) => (disabled ? e.preventDefault() : onClose())}
        className="flex min-h-[48px] items-center justify-between rounded-tile border border-line px-3.5 text-[15px] font-semibold text-ink no-underline"
      >
        Enter it manually
        <ChevronRightIcon size={18} className="text-muted" />
      </Link>

      {saved.loading ? (
        <div className="flex gap-2">
          <Skeleton className="h-[52px] flex-1 rounded-tile" />
          <Skeleton className="h-[52px] flex-1 rounded-tile" />
        </div>
      ) : recents.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="m-0 text-[13px] font-semibold text-muted">Saved meals</h3>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
            {recents.map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={disabled || logging !== null}
                aria-busy={logging === m.id || undefined}
                onClick={() => logSaved(m.id, m.name)}
                className="flex min-h-[52px] min-w-[150px] flex-1 flex-col gap-0.5 rounded-tile bg-white px-3 py-2.5 text-left text-ink disabled:opacity-60"
              >
                <span className="line-clamp-1 text-[14px] font-bold">{m.name}</span>
                <span className="text-[12px] text-muted">
                  {logging === m.id ? "Adding…" : `${kcal(m.base.kcal)} kcal`}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </>
  )
}

function Tile({
  href,
  icon,
  title,
  sub,
  onNavigate,
  disabled,
}: {
  href: string
  icon: React.ReactNode
  title: string
  sub: string
  onNavigate: () => void
  disabled?: boolean
}) {
  return (
    <Link
      href={href}
      aria-disabled={disabled}
      onClick={(e) => (disabled ? e.preventDefault() : onNavigate())}
      className="flex flex-col gap-2.5 rounded-card bg-white p-3.5 text-ink no-underline"
    >
      {icon}
      <span className="flex flex-col gap-0.5">
        <span className="text-[15px] font-bold">{title}</span>
        <span className="text-[12px] text-muted">{sub}</span>
      </span>
    </Link>
  )
}
