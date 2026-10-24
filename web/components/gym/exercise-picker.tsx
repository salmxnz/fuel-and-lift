"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Sheet } from "@/components/ui/sheet"
import { Button, Chip, Field, Skeleton, TextInput } from "@/components/ui/primitives"
import { PlusIcon, SearchIcon } from "@/components/ui/icons"
import { api, errorMessage } from "@/lib/api/client"
import type { Exercise, ExerciseKind, ExerciseResponse, ExercisesResponse } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { ExerciseIcon } from "./exercise-icon"

/** Search the exercise library or create a new exercise. */
export function ExercisePicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (exercise: Exercise) => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Add exercise">
      {open ? <PickerBody onPick={onPick} /> : null}
    </Sheet>
  )
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms)
    return () => window.clearTimeout(t)
  }, [value, ms])
  return v
}

function PickerBody({ onPick }: { onPick: (exercise: Exercise) => void }) {
  const [q, setQ] = useState("")
  const query = useDebounced(q.trim(), 250)
  // Old results stay while a new search loads, so the sheet doesn't jump.
  const results = useApi<ExercisesResponse>(`exercises?q=${encodeURIComponent(query)}`, { keepPrevious: true })
  const [creating, setCreating] = useState(false)
  const [kind, setKind] = useState<ExerciseKind>("strength")
  const [muscle, setMuscle] = useState("")
  const [equipment, setEquipment] = useState("")
  const [busy, setBusy] = useState(false)

  const list = results.data?.exercises ?? []
  const exact = list.some((e) => e.name.toLowerCase() === q.trim().toLowerCase())

  async function create(e: React.FormEvent) {
    e.preventDefault()
    const name = q.trim()
    if (!name) return
    setBusy(true)
    try {
      const res = await api.post<ExerciseResponse>("exercises", {
        name,
        kind,
        muscle_group: muscle.trim() || null,
        equipment: equipment.trim() || null,
      })
      onPick(res.exercise)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex min-h-[48px] items-center gap-2.5 rounded-tile border border-line bg-white px-3.5">
        <SearchIcon size={18} className="text-muted" />
        <span className="sr-only">Search exercises</span>
        <input
          data-autofocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Lat pulldown, treadmill…"
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"
        />
      </label>

      {creating ? (
        <form onSubmit={create} className="flex flex-col gap-3 rounded-card bg-white p-3.5">
          <span className="text-[15px] font-bold">New: {q.trim() || "…"}</span>
          <div role="radiogroup" aria-label="Kind" className="flex gap-1.5">
            <Chip selected={kind === "strength"} onClick={() => setKind("strength")}>
              Strength
            </Chip>
            <Chip selected={kind === "cardio"} onClick={() => setKind("cardio")}>
              Cardio
            </Chip>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Muscle group" htmlFor="ex-muscle">
              <TextInput id="ex-muscle" value={muscle} maxLength={40} placeholder="Back" onChange={(e) => setMuscle(e.target.value)} />
            </Field>
            <Field label="Equipment" htmlFor="ex-eq">
              <TextInput id="ex-eq" value={equipment} maxLength={40} placeholder="Machine" onChange={(e) => setEquipment(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" size="md" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button type="submit" size="md" loading={busy} disabled={!q.trim()}>
              Create
            </Button>
          </div>
        </form>
      ) : null}

      <div className="flex max-h-[46dvh] flex-col overflow-y-auto rounded-card bg-white px-3.5 py-1">
        {results.loading ? (
          <div className="flex flex-col gap-2 py-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : results.error ? (
          <p className="m-0 py-3 text-[14px] text-danger">{results.error.message}</p>
        ) : list.length === 0 ? (
          <p className="m-0 py-3 text-[14px] text-muted">{query ? `No exercise called “${query}” yet.` : "No exercises yet."}</p>
        ) : (
          list.map((ex) => (
            <button
              key={ex.id}
              type="button"
              onClick={() => onPick(ex)}
              className="flex min-h-[52px] items-center justify-between gap-3 border-b border-line-soft py-2 text-left last:border-b-0"
            >
              <ExerciseIcon exercise={ex} size={40} className="rounded-[10px]" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-bold">{ex.name}</span>
                <span className="text-[12px] text-muted">
                  {ex.matched_alias ? `Matches “${ex.matched_alias}” · ` : ""}
                  {[ex.muscle_group, ex.equipment, ex.kind === "cardio" ? "Cardio" : null].filter(Boolean).join(", ") || "Exercise"}
                </span>
              </span>
              <PlusIcon size={18} className="flex-none text-protein" />
            </button>
          ))
        )}
      </div>

      {!creating && q.trim() && !exact ? (
        <Button variant="outline" size="md" onClick={() => setCreating(true)}>
          <PlusIcon size={18} /> Create “{q.trim()}”
        </Button>
      ) : null}
    </div>
  )
}
