"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Sheet } from "@/components/ui/sheet"
import { Avatar, Button, Chip, Field, Skeleton, Spinner, TextInput } from "@/components/ui/primitives"
import { CameraIcon, ChatIcon, PlusIcon, SearchIcon } from "@/components/ui/icons"
import { VisibilityIcon, VisibilitySelect, VISIBILITY_LABEL } from "@/components/community/visibility-select"
import { api, errorMessage, seg } from "@/lib/api/client"
import type {
  Exercise,
  ExerciseAIResponse,
  ExerciseKind,
  ExerciseResponse,
  ExercisesResponse,
  SharedExercise,
  SharedExercisesResponse,
  Visibility,
} from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { cn } from "@/lib/cn"
import { prepareImage, type PreparedImage } from "@/lib/image"
import { DescribePanel, SnapResult, type PickPlan } from "./exercise-ai"
import { ExerciseIcon } from "./exercise-icon"

export type { PickPlan }

/**
 * Add an exercise: search the library and your own, add one a friend or the
 * Shop shares, describe it to the AI, or snap the machine. A photo plans the
 * sets too (`plan`).
 */
export function ExercisePicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (exercise: Exercise, plan?: PickPlan) => void
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

type Source = "library" | "friends" | "public"
type Mode = { kind: "browse" } | { kind: "describe" } | { kind: "snap"; photo: PreparedImage; res: ExerciseAIResponse }

function PickerBody({ onPick }: { onPick: (exercise: Exercise, plan?: PickPlan) => void }) {
  const [mode, setMode] = useState<Mode>({ kind: "browse" })
  const [q, setQ] = useState("")
  const [source, setSource] = useState<Source>("library")
  const [snapping, setSnapping] = useState(false)

  async function snap(file: File | undefined) {
    if (!file) return
    setSnapping(true)
    try {
      const photo = await prepareImage(file, { maxSide: 1024 })
      const res = await api.post<ExerciseAIResponse>("ai/exercise", { images: [{ media_type: photo.mediaType, data: photo.data }] })
      setMode({ kind: "snap", photo, res })
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSnapping(false)
    }
  }

  if (mode.kind === "describe") return <DescribePanel onPick={onPick} onBack={() => setMode({ kind: "browse" })} />
  if (mode.kind === "snap") {
    return (
      <SnapResult
        photo={mode.photo}
        res={mode.res}
        onPick={onPick}
        onRetake={() => {
          URL.revokeObjectURL(mode.photo.previewUrl)
          setMode({ kind: "browse" })
        }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <label
          className={cn(
            "flex min-h-[64px] cursor-pointer items-center gap-2.5 rounded-tile bg-ink px-3 text-white transition-transform duration-150 ease-out focus-within:outline-2 focus-within:outline-ink active:scale-[0.98]",
            snapping && "pointer-events-none opacity-70"
          )}
        >
          {snapping ? <Spinner size={22} /> : <CameraIcon size={24} className="text-pink" />}
          <span className="flex flex-col leading-tight">
            <span className="text-[15px] font-extrabold">{snapping ? "Looking…" : "Snap the machine"}</span>
            <span className="text-[11.5px] text-night-muted">Reads the weight too</span>
          </span>
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void snap(e.target.files?.[0])} />
        </label>
        <button
          type="button"
          onClick={() => setMode({ kind: "describe" })}
          className="flex min-h-[64px] items-center gap-2.5 rounded-tile border border-line bg-white px-3 text-left transition-transform duration-150 ease-out active:scale-[0.98]"
        >
          <ChatIcon size={22} />
          <span className="flex flex-col leading-tight">
            <span className="text-[15px] font-extrabold">Describe it</span>
            <span className="text-[11.5px] text-muted">“rear delt” → 3 options</span>
          </span>
        </button>
      </div>

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

      <div role="radiogroup" aria-label="Where from" className="flex gap-1.5">
        <Chip selected={source === "library"} onClick={() => setSource("library")}>
          Library
        </Chip>
        <Chip selected={source === "friends"} onClick={() => setSource("friends")}>
          Friends
        </Chip>
        <Chip selected={source === "public"} onClick={() => setSource("public")}>
          Shop
        </Chip>
      </div>

      {source === "library" ? <LibraryList q={q} onPick={onPick} /> : <SharedList scope={source} q={q} onPick={onPick} />}
    </div>
  )
}

function LibraryList({ q, onPick }: { q: string; onPick: (exercise: Exercise) => void }) {
  const query = useDebounced(q.trim(), 250)
  // Old results stay while a new search loads, so the sheet doesn't jump.
  const results = useApi<ExercisesResponse>(`exercises?q=${encodeURIComponent(query)}`, { keepPrevious: true })
  const [creating, setCreating] = useState(false)
  const [sharing, setSharing] = useState<string | null>(null)
  const list = results.data?.exercises ?? []
  const exact = list.some((e) => e.name.toLowerCase() === q.trim().toLowerCase())

  return (
    <>
      {creating ? <CreateForm name={q.trim()} onCancel={() => setCreating(false)} onCreated={onPick} /> : null}

      <div className="flex max-h-[46dvh] flex-col overflow-y-auto rounded-card bg-white px-3.5 py-1">
        {results.loading ? (
          <ListSkeleton />
        ) : results.error ? (
          <p className="m-0 py-3 text-[14px] text-danger">{results.error.message}</p>
        ) : list.length === 0 ? (
          <p className="m-0 py-3 text-[14px] text-muted">{query ? `No exercise called “${query}” yet.` : "No exercises yet."}</p>
        ) : (
          list.map((ex) => (
            <div key={ex.id} className="border-b border-line-soft last:border-b-0">
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => onPick(ex)} className="flex min-h-[56px] min-w-0 flex-1 items-center gap-3 py-2 text-left">
                  <ExerciseIcon exercise={ex} size={44} className="rounded-[10px]" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-bold">{ex.name}</span>
                    <span className="truncate text-[12px] text-muted">
                      {ex.matched_alias ? `Matches “${ex.matched_alias}” · ` : ""}
                      {ex.muscles.length ? ex.muscles.slice(0, 2).join(", ") : [ex.muscle_group, ex.equipment, ex.kind === "cardio" ? "Cardio" : null].filter(Boolean).join(", ") || "Exercise"}
                    </span>
                  </span>
                </button>
                {ex.mine ? (
                  <button
                    type="button"
                    aria-label={`${ex.name}: ${VISIBILITY_LABEL[ex.visibility]}. Change who sees it`}
                    aria-expanded={sharing === ex.id}
                    onClick={() => setSharing((s) => (s === ex.id ? null : ex.id))}
                    className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-muted"
                  >
                    <VisibilityIcon visibility={ex.visibility} size={18} />
                  </button>
                ) : null}
                <button type="button" aria-label={`Add ${ex.name}`} onClick={() => onPick(ex)} className="flex h-11 w-9 flex-none items-center justify-center">
                  <PlusIcon size={18} className="text-protein" />
                </button>
              </div>
              {sharing === ex.id ? (
                <VisibilitySelect
                  className="pb-3"
                  value={ex.visibility}
                  path={`exercises/${seg(ex.id)}/visibility`}
                  note="Friends see your photo of it; the Shop shows only the stock picture."
                  onChange={(v) =>
                    results.setData((prev) => ({
                      exercises: (prev?.exercises ?? []).map((x) => (x.id === ex.id ? { ...x, visibility: v } : x)),
                    }))
                  }
                />
              ) : null}
            </div>
          ))
        )}
      </div>

      {!creating && q.trim() && !exact ? (
        <Button variant="outline" size="md" onClick={() => setCreating(true)}>
          <PlusIcon size={18} /> Create “{q.trim()}”
        </Button>
      ) : null}
    </>
  )
}

function CreateForm({ name, onCancel, onCreated }: { name: string; onCancel: () => void; onCreated: (e: Exercise) => void }) {
  const [kind, setKind] = useState<ExerciseKind>("strength")
  const [muscle, setMuscle] = useState("")
  const [equipment, setEquipment] = useState("")
  const [visibility, setVisibility] = useState<Visibility>("private")
  const [busy, setBusy] = useState(false)

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!name) return
    setBusy(true)
    try {
      let ex = (
        await api.post<ExerciseResponse>("exercises", {
          name,
          kind,
          muscle_group: muscle.trim() || null,
          equipment: equipment.trim() || null,
        })
      ).exercise
      if (visibility !== "private") {
        ex = (await api.put<ExerciseResponse>(`exercises/${seg(ex.id)}/visibility`, { visibility })).exercise
      }
      onCreated(ex)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={create} className="flex flex-col gap-3 rounded-card bg-white p-3.5">
      <span className="text-[15px] font-bold">New: {name || "…"}</span>
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
      <VisibilitySelect value={visibility} onChange={setVisibility} />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" size="md" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="md" loading={busy} disabled={!name}>
          Create
        </Button>
      </div>
    </form>
  )
}

/** Exercises friends share, or everyone's in the Shop. Adding one copies it into yours. */
function SharedList({ scope, q, onPick }: { scope: "friends" | "public"; q: string; onPick: (exercise: Exercise) => void }) {
  const query = useDebounced(q.trim(), 250)
  const results = useApi<SharedExercisesResponse>(`exercises/shared?scope=${scope}&q=${encodeURIComponent(query)}`, { keepPrevious: true })
  const [adding, setAdding] = useState<string | null>(null)
  const list = results.data?.exercises ?? []

  async function add(x: SharedExercise) {
    setAdding(x.id)
    try {
      const res = await api.post<ExerciseResponse>(`exercises/${seg(x.id)}/add`)
      onPick(res.exercise)
    } catch (err) {
      toast.error(errorMessage(err))
      setAdding(null)
    }
  }

  return (
    <div className="flex max-h-[46dvh] flex-col overflow-y-auto rounded-card bg-white px-3.5 py-1">
      {results.loading ? (
        <ListSkeleton />
      ) : results.error ? (
        <p className="m-0 py-3 text-[14px] text-danger">{results.error.message}</p>
      ) : list.length === 0 ? (
        <p className="m-0 py-3 text-[14px] text-muted">
          {query
            ? `Nothing called “${query}”.`
            : scope === "friends"
              ? "Your friends haven't shared any exercises yet. Share yours from the Library list."
              : "No one has put an exercise in the Shop yet."}
        </p>
      ) : (
        list.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => void add(x)}
            disabled={adding !== null}
            className="flex min-h-[60px] items-center gap-3 border-b border-line-soft py-2 text-left last:border-b-0 disabled:opacity-60"
          >
            <ExerciseIcon exercise={x} size={44} className="rounded-[10px]" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[15px] font-bold">{x.name}</span>
              <span className="flex items-center gap-1.5 text-[12px] text-muted">
                <Avatar name={x.owner.name} url={x.owner.avatar_url} size={16} />
                <span className="truncate">
                  {x.owner.name}
                  {x.muscles.length ? ` · ${x.muscles.slice(0, 2).join(", ")}` : x.muscle_group ? ` · ${x.muscle_group}` : ""}
                </span>
              </span>
            </span>
            {adding === x.id ? (
              <Spinner size={18} />
            ) : x.added_id ? (
              <span className="flex-none text-[12px] font-semibold text-protein">Yours</span>
            ) : (
              <PlusIcon size={18} className="flex-none text-protein" />
            )}
          </button>
        ))
      )}
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2 py-2">
      <Skeleton className="h-10" />
      <Skeleton className="h-10" />
      <Skeleton className="h-10" />
    </div>
  )
}
