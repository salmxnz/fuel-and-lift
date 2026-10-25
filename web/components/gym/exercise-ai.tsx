"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button, Spinner } from "@/components/ui/primitives"
import { CheckIcon, MinusIcon, PlusIcon } from "@/components/ui/icons"
import { VisibilitySelect } from "@/components/community/visibility-select"
import { ApiError, api, errorMessage, seg } from "@/lib/api/client"
import type {
  Exercise,
  ExerciseAIResponse,
  ExerciseOption,
  ExerciseResponse,
  ExercisesResponse,
  NewExerciseRequest,
  PlannedSet,
  Visibility,
} from "@/lib/api/types"
import { cn } from "@/lib/cn"
import type { PreparedImage } from "@/lib/image"
import { num1 } from "@/lib/format"
import { ExerciseIcon } from "./exercise-icon"

// Adding an exercise with the AI: describe it ("rear delt" → up to three
// variations to pick from) or snap the machine (it says which exercise it is
// and reads the weight off the pin or the plates).

export type PickPlan = { sets: PlannedSet[] }

/** The exercise an option stands for: the library match, or a new one of the user's. */
export async function resolveOption(o: ExerciseOption, visibility: Visibility = "private"): Promise<Exercise> {
  if (o.match) return o.match
  const body: NewExerciseRequest = {
    name: o.name,
    kind: o.kind,
    muscle_group: o.muscle_group || null,
    equipment: o.equipment || null,
    muscles: o.muscles,
    picture_from: o.picture_from,
  }
  let ex: Exercise
  try {
    ex = (await api.post<ExerciseResponse>("exercises", body)).exercise
  } catch (err) {
    // They already made one by that name: use it.
    if (!(err instanceof ApiError) || err.status !== 409) throw err
    const found = await api.get<ExercisesResponse>("exercises", { q: o.name })
    const same = found.exercises.find((e) => e.name.toLowerCase() === o.name.toLowerCase())
    if (!same) throw err
    return same
  }
  if (visibility !== "private") {
    ex = (await api.put<ExerciseResponse>(`exercises/${seg(ex.id)}/visibility`, { visibility })).exercise
  }
  return ex
}

/** n working sets of kg × reps. */
export function planOf(n: number, kg: number | null, reps: number | null): PickPlan {
  return {
    sets: Array.from({ length: n }, () => ({ warmup: false, target_kg: kg, target_reps: reps, to_failure: reps == null })),
  }
}

/** An option as a tappable card: picture, name, what it works. */
function OptionCard({ o, onPick, busy, disabled }: { o: ExerciseOption; onPick: () => void; busy: boolean; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-card bg-white p-2.5 text-left transition-transform duration-150 ease-out enabled:active:scale-[0.98] disabled:opacity-60"
    >
      <ExerciseIcon
        exercise={{ name: o.name, kind: o.kind, equipment: o.equipment || null, media_url: o.media_url, gym_photo_url: o.match?.gym_photo_url ?? null }}
        size={64}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[16px] font-bold">{o.name}</span>
          <span className={cn("flex-none rounded-full px-1.5 py-0.5 text-[10.5px] font-bold", o.match ? "bg-mint text-ink" : "bg-pink-soft text-ink")}>
            {o.match ? "In library" : "New"}
          </span>
        </span>
        {o.cue ? <span className="text-[13px] leading-snug text-muted">{o.cue}</span> : null}
        {o.muscles.length > 0 ? (
          <span className="flex flex-wrap gap-1">
            {o.muscles.map((m, i) => (
              <span key={m} className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", i === 0 ? "bg-ink text-white" : "bg-chip text-ink")}>
                {m}
              </span>
            ))}
          </span>
        ) : null}
      </span>
      {busy ? <Spinner size={18} /> : <PlusIcon size={18} className="flex-none text-protein" />}
    </button>
  )
}

/** "Describe it": free text in, up to three options out. */
export function DescribePanel({ onPick, onBack }: { onPick: (e: Exercise, plan?: PickPlan) => void; onBack: () => void }) {
  const [text, setText] = useState("")
  const [asking, setAsking] = useState(false)
  const [res, setRes] = useState<ExerciseAIResponse | null>(null)
  const [picking, setPicking] = useState<number | null>(null)

  async function ask(e: React.FormEvent) {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    setAsking(true)
    try {
      setRes(await api.post<ExerciseAIResponse>("ai/exercise", { text: t }))
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setAsking(false)
    }
  }

  async function pick(i: number) {
    if (!res) return
    setPicking(i)
    try {
      const ex = await resolveOption(res.options[i])
      const said = res.weight_source === "text" || res.reps != null
      onPick(ex, ex.kind === "strength" && said ? planOf(res.sets || 3, res.weight_kg, res.reps) : undefined)
    } catch (err) {
      toast.error(errorMessage(err))
      setPicking(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={ask} className="flex flex-col gap-2">
        <label htmlFor="ai-describe" className="text-[13px] font-semibold text-muted">
          A muscle, a machine or a move
        </label>
        <textarea
          id="ai-describe"
          data-autofocus
          rows={2}
          maxLength={300}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="rear delt · upper chest · the pec deck, 40 kg 3×10"
          className="min-h-[72px] resize-none rounded-tile border border-line bg-white px-3.5 py-3 text-[15px] outline-none focus:border-[1.5px] focus:border-ink"
        />
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <Button variant="ghost" size="md" onClick={onBack}>
            Back
          </Button>
          <Button type="submit" size="md" loading={asking} disabled={!text.trim()}>
            {res ? "Ask again" : "Find it"}
          </Button>
        </div>
      </form>
      {res ? (
        res.options.length === 0 ? (
          <p className="m-0 rounded-card bg-white p-3.5 text-[14px] text-muted">Couldn&apos;t place that one. Try naming the muscle or the machine.</p>
        ) : (
          <div className="flex flex-col gap-2" role="list" aria-label="Pick one">
            {res.options.length > 1 ? <span className="text-[13px] font-semibold text-muted">Pick the one you want</span> : null}
            {res.options.map((o, i) => (
              <div key={o.name} role="listitem">
                <OptionCard o={o} onPick={() => void pick(i)} busy={picking === i} disabled={picking !== null} />
              </div>
            ))}
            {res.note ? <p className="m-0 text-[13px] text-muted">{res.note}</p> : null}
          </div>
        )
      ) : null}
    </div>
  )
}

/** What a photo of a machine came back as: the exercise, the weight on it, the sets. */
export function SnapResult({
  photo,
  res,
  onPick,
  onRetake,
}: {
  photo: PreparedImage
  res: ExerciseAIResponse
  onPick: (e: Exercise, plan?: PickPlan) => void
  onRetake: () => void
}) {
  const [choice, setChoice] = useState(0)
  const [kg, setKg] = useState<number | null>(res.weight_kg)
  const [sets, setSets] = useState(res.sets || 3)
  const [reps, setReps] = useState(res.reps ?? 10)
  const [keepPhoto, setKeepPhoto] = useState(true)
  const [visibility, setVisibility] = useState<Visibility>("private")
  const [busy, setBusy] = useState(false)
  const o = res.options[choice]
  const cardio = o?.kind === "cardio"

  async function add() {
    if (!o) return
    setBusy(true)
    try {
      let ex = await resolveOption(o, visibility)
      if (keepPhoto) {
        try {
          ex = (await api.put<ExerciseResponse>(`exercises/${seg(ex.id)}/photo`, { media_type: photo.mediaType, data: photo.data })).exercise
        } catch (err) {
          toast.error(`Added, but the photo didn't save: ${errorMessage(err)}`)
        }
      }
      onPick(ex, cardio ? undefined : planOf(sets, kg, reps))
    } catch (err) {
      toast.error(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 rounded-card bg-white p-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element -- the user's own photo, a local object URL */}
        <img src={photo.previewUrl} alt="Your photo" className="h-[72px] w-[72px] flex-none rounded-tile object-cover" />
        <div className="flex min-w-0 flex-col gap-0.5">
          {o ? (
            <>
              <span className="text-[12px] font-semibold text-muted">{o.match ? "Looks like" : "New exercise"}</span>
              <span className="text-[18px] font-extrabold leading-tight tracking-[-0.01em]">{o.name}</span>
              {o.muscles.length ? <span className="text-[13px] text-muted">{o.muscles.join(" · ")}</span> : null}
            </>
          ) : (
            <span className="text-[15px] font-semibold">No gym equipment in that one. Try again, a bit further back.</span>
          )}
        </div>
      </div>

      {res.options.length > 1 ? (
        <div role="radiogroup" aria-label="Which one" className="flex flex-wrap gap-1.5">
          {res.options.map((x, i) => (
            <button
              key={x.name}
              type="button"
              role="radio"
              aria-checked={i === choice}
              onClick={() => setChoice(i)}
              className={cn("min-h-[34px] rounded-full px-3 text-[13px]", i === choice ? "bg-ink font-bold text-white" : "border border-line bg-white")}
            >
              {x.name}
            </button>
          ))}
        </div>
      ) : null}

      {o && !cardio ? (
        <div className="flex flex-col gap-2 rounded-card bg-white p-3">
          <div className="grid grid-cols-3 gap-2">
            <Step label="kg" value={kg != null ? num1(kg) : "–"} onMinus={() => setKg((v) => Math.max(0, (v ?? 0) - 2.5))} onPlus={() => setKg((v) => (v ?? 0) + 2.5)} />
            <Step label="sets" value={String(sets)} onMinus={() => setSets((v) => Math.max(1, v - 1))} onPlus={() => setSets((v) => Math.min(12, v + 1))} />
            <Step label="reps" value={String(reps)} onMinus={() => setReps((v) => Math.max(1, v - 1))} onPlus={() => setReps((v) => Math.min(100, v + 1))} />
          </div>
          <span className="text-[12.5px] text-muted">
            {res.weight_kg != null ? `Read off the photo: ${res.weight_note || `${num1(res.weight_kg)} kg`}. Check it.` : res.weight_note || "Couldn't see the weight: set it yourself."}
          </span>
        </div>
      ) : null}

      {res.note ? <p className="m-0 text-[13px] text-muted">{res.note}</p> : null}

      {o ? (
        <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-[14px]">
          <input type="checkbox" checked={keepPhoto} onChange={(e) => setKeepPhoto(e.target.checked)} className="h-5 w-5 accent-[var(--color-ink)]" />
          Use my photo as its picture
        </label>
      ) : null}
      {o && !o.match ? <VisibilitySelect value={visibility} onChange={setVisibility} /> : null}

      <div className="grid grid-cols-[auto_1fr] gap-2">
        <Button variant="ghost" size="md" onClick={onRetake} disabled={busy}>
          Retake
        </Button>
        <Button size="md" onClick={() => void add()} loading={busy} disabled={!o}>
          <CheckIcon size={18} /> Add {cardio || !o ? "" : `${sets} × ${reps}`}
        </Button>
      </div>
    </div>
  )
}

function Step({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-tile bg-field p-1">
      <button type="button" aria-label={`Less ${label}`} onClick={onMinus} className="flex h-10 w-9 items-center justify-center rounded-[10px]">
        <MinusIcon size={16} />
      </button>
      <span className="flex flex-col items-center leading-none" aria-live="polite">
        <span className="text-[18px] font-black tabular-nums">{value}</span>
        <span className="mt-0.5 text-[11px] font-semibold text-muted">{label}</span>
      </span>
      <button type="button" aria-label={`More ${label}`} onClick={onPlus} className="flex h-10 w-9 items-center justify-center rounded-[10px]">
        <PlusIcon size={16} />
      </button>
    </div>
  )
}
