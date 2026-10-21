"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button, ErrorCard, Field, PageHeader, Skeleton, TextInput } from "@/components/ui/primitives"
import { ChevronRightIcon, DragIcon, InfoIcon, PlusIcon } from "@/components/ui/icons"
import { Sheet } from "@/components/ui/sheet"
import { api, errorMessage, seg } from "@/lib/api/client"
import type { MealSchedule, MealSlot, MealSlotResponse, MealSlotsResponse } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { cn } from "@/lib/cn"

type Drag = { id: string; from: number; over: number; dy: number; rowH: number; startY: number }

export function MealSlotsScreen() {
  const slots = useApi<MealSlotsResponse>("meal-slots")
  const [order, setOrder] = useState<MealSlot[] | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [editing, setEditing] = useState<MealSlot | "new" | null>(null)
  const [announce, setAnnounce] = useState("")

  const list = order ?? [...(slots.data?.meal_slots ?? [])].sort((a, b) => a.position - b.position)

  async function persist(next: MealSlot[], prev: MealSlot[]) {
    setOrder(next)
    try {
      const res = await api.put<MealSlotsResponse>("meal-slots/order", { ids: next.map((s) => s.id) })
      slots.setData(res)
      setOrder(null)
    } catch (err) {
      toast.error(errorMessage(err))
      setOrder(prev)
    }
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= list.length || from === to) return
    const prev = list
    const next = [...list]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    setAnnounce(`${item.name} moved to position ${to + 1} of ${next.length}`)
    void persist(next, prev)
  }

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>, slot: MealSlot, index: number) {
    if (e.button !== 0) return
    const row = e.currentTarget.closest("li")
    const rowH = row?.getBoundingClientRect().height ?? 60
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ id: slot.id, from: index, over: index, dy: 0, rowH, startY: e.clientY })
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag) return
    const dy = e.clientY - drag.startY
    const over = Math.max(0, Math.min(list.length - 1, drag.from + Math.round(dy / drag.rowH)))
    setDrag({ ...drag, dy, over })
  }

  function onPointerUp() {
    if (!drag) return
    const { from, over } = drag
    setDrag(null)
    if (from !== over) move(from, over)
  }

  function shiftFor(index: number): number {
    if (!drag || index === drag.from) return 0
    if (drag.from < drag.over && index > drag.from && index <= drag.over) return -drag.rowH
    if (drag.from > drag.over && index < drag.from && index >= drag.over) return drag.rowH
    return 0
  }

  return (
    <div className="flex flex-col gap-3.5">
      <PageHeader back="/me" backLabel="Back to Me" eyebrow="Me" title="My meals" />
      <p className="m-0 text-[14px] leading-[1.45] text-muted">
        These show on Today every day, in this order. Drag to reorder, tap to rename or change when they show.
      </p>
      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>

      {slots.error && !slots.data ? (
        <ErrorCard message={slots.error.message} onRetry={() => void slots.reload()} />
      ) : slots.loading ? (
        <Skeleton className="h-[240px] rounded-card" />
      ) : list.length === 0 ? (
        <div className="rounded-card border-[1.5px] border-dashed border-dash p-4 text-[15px] text-muted">
          No meals yet. Add the ones you eat most days.
        </div>
      ) : (
        <ol aria-label="Meals" className="m-0 flex list-none flex-col rounded-card bg-white px-3.5 py-1">
          {list.map((slot, i) => {
            const dragging = drag?.id === slot.id
            const y = dragging ? drag.dy : shiftFor(i)
            return (
              <li
                key={slot.id}
                className={cn(
                  "relative flex min-h-[60px] items-center gap-3 border-b border-line-soft bg-white last:border-b-0",
                  dragging ? "z-10 rounded-[12px] shadow-[0_8px_24px_rgba(23,26,18,0.18)]" : "transition-transform duration-150"
                )}
                style={{ transform: y ? `translateY(${y}px)` : undefined }}
              >
                <button
                  type="button"
                  aria-label={`Reorder ${slot.name}. Use arrow keys to move.`}
                  aria-roledescription="drag handle"
                  onPointerDown={(e) => onPointerDown(e, slot, i)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={() => setDrag(null)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp") {
                      e.preventDefault()
                      move(i, i - 1)
                    } else if (e.key === "ArrowDown") {
                      e.preventDefault()
                      move(i, i + 1)
                    }
                  }}
                  className="flex h-11 w-9 flex-none touch-none items-center justify-center text-dash"
                  style={{ cursor: dragging ? "grabbing" : "grab" }}
                >
                  <DragIcon size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(slot)}
                  className="flex min-h-[56px] flex-1 items-center justify-between text-left"
                >
                  <span className="flex flex-col">
                    <span className="text-[16px] font-bold">{slot.name}</span>
                    {slot.schedule === "gym_days" ? (
                      <span className="text-[12px] font-semibold text-protein">Gym days only</span>
                    ) : (
                      <span className="text-[12px] text-muted">Every day</span>
                    )}
                  </span>
                  <ChevronRightIcon size={18} className="text-muted" />
                </button>
              </li>
            )
          })}
        </ol>
      )}

      <button
        type="button"
        onClick={() => setEditing("new")}
        className="flex min-h-[52px] items-center justify-center gap-2 rounded-btn border-[1.5px] border-dashed border-dash text-[15px] font-bold"
      >
        <PlusIcon size={18} /> Add a meal
      </button>

      <div className="flex items-start gap-2.5 rounded-tile bg-white px-3.5 py-3">
        <InfoIcon size={20} className="mt-px flex-none text-protein" />
        <span className="text-[13px] leading-[1.45]">
          Need one just for today, like a late-night snack? Use <strong>Add a meal today</strong>
          {" on Today. It won't change this list."}
        </span>
      </div>

      <SlotSheet
        slot={editing}
        onClose={() => setEditing(null)}
        onSaved={(s, isNew) => {
          slots.setData((prev) => {
            const cur = prev?.meal_slots ?? []
            return { meal_slots: isNew ? [...cur, s] : cur.map((x) => (x.id === s.id ? s : x)) }
          })
          setEditing(null)
        }}
        onDeleted={(id) => {
          slots.setData((prev) => ({ meal_slots: (prev?.meal_slots ?? []).filter((x) => x.id !== id) }))
          setEditing(null)
        }}
      />
    </div>
  )
}

function SlotSheet({
  slot,
  onClose,
  onSaved,
  onDeleted,
}: {
  slot: MealSlot | "new" | null
  onClose: () => void
  onSaved: (slot: MealSlot, isNew: boolean) => void
  onDeleted: (id: string) => void
}) {
  const isNew = slot === "new"
  return (
    <Sheet open={slot !== null} onClose={onClose} title={isNew ? "Add a meal" : "Edit meal"}>
      {slot !== null ? (
        <SlotForm key={isNew ? "new" : slot.id} slot={isNew ? null : slot} onSaved={onSaved} onDeleted={onDeleted} />
      ) : null}
    </Sheet>
  )
}

function SlotForm({
  slot,
  onSaved,
  onDeleted,
}: {
  slot: MealSlot | null
  onSaved: (slot: MealSlot, isNew: boolean) => void
  onDeleted: (id: string) => void
}) {
  const [name, setName] = useState(slot?.name ?? "")
  const [schedule, setSchedule] = useState<MealSchedule>(slot?.schedule ?? "daily")
  const [busy, setBusy] = useState<"save" | "delete" | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!confirmDelete) return
    const t = window.setTimeout(() => setConfirmDelete(false), 4000)
    return () => window.clearTimeout(t)
  }, [confirmDelete])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) {
      setError("Give the meal a name")
      return
    }
    setBusy("save")
    setError(null)
    try {
      const res = slot
        ? await api.patch<MealSlotResponse>(`meal-slots/${seg(slot.id)}`, { name: n, schedule })
        : await api.post<MealSlotResponse>("meal-slots", { name: n, schedule })
      onSaved(res.meal_slot, !slot)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function remove() {
    if (!slot) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setBusy("delete")
    try {
      await api.del(`meal-slots/${seg(slot.id)}`)
      toast.success(`${slot.name} removed. Past entries keep their name.`)
      onDeleted(slot.id)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4" noValidate>
      <Field label="Name" htmlFor="slot-name">
        <TextInput
          id="slot-name"
          data-autofocus
          value={name}
          maxLength={40}
          placeholder="Pre-workout"
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1.5 text-[13px] font-semibold text-muted">Shows on</legend>
        {(
          [
            ["daily", "Every day", "Always on Today"],
            ["gym_days", "Gym days only", "Only on days your weekly plan has a workout"],
          ] as const
        ).map(([value, title, sub]) => (
          <label
            key={value}
            className={cn(
              "flex min-h-[56px] cursor-pointer items-center gap-3 rounded-tile border-2 px-3.5 py-2",
              schedule === value ? "border-ink bg-lime" : "border-transparent bg-white"
            )}
          >
            <input
              type="radio"
              name="schedule"
              value={value}
              checked={schedule === value}
              onChange={() => setSchedule(value)}
              className="h-5 w-5 accent-ink"
            />
            <span className="flex flex-col">
              <span className="text-[15px] font-bold">{title}</span>
              <span className={cn("text-[12px]", schedule === value ? "text-ink" : "text-muted")}>{sub}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {error ? (
        <p role="alert" className="m-0 text-[14px] font-semibold text-danger">
          {error}
        </p>
      ) : null}
      <div className={cn("grid gap-2", slot ? "grid-cols-2" : "grid-cols-1")}>
        {slot ? (
          <Button variant="danger" onClick={remove} loading={busy === "delete"} disabled={busy === "save"}>
            {confirmDelete ? "Tap to confirm" : "Delete"}
          </Button>
        ) : null}
        <Button type="submit" loading={busy === "save"} disabled={busy === "delete"}>
          {slot ? "Save" : "Add meal"}
        </Button>
      </div>
    </form>
  )
}
