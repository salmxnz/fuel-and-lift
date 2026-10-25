"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button, Spinner } from "@/components/ui/primitives"
import { CameraIcon, CheckIcon, PencilIcon } from "@/components/ui/icons"
import { api, errorMessage } from "@/lib/api/client"
import type { Cardio, CardioScreenResponse, SessionBlock } from "@/lib/api/types"
import { CARDIO_FIELD_LABEL, cardioFields, cardioText, type CardioField } from "@/lib/cardio"
import { cn } from "@/lib/cn"
import { parseDecimal } from "@/lib/format"
import { prepareImage } from "@/lib/image"

type Field = "minutes" | CardioField | "kcal"

/**
 * A cardio block in the workout: mark it done, snap the machine's screen to
 * fill in what you did, or type it. Only the fields that machine has show.
 */
export function CardioPanel({ block, onCardio }: { block: SessionBlock; onCardio: (done: boolean, actual?: Cardio | null) => void }) {
  const plan = block.cardio!
  const actual = block.cardio_actual
  const fields: Field[] = ["minutes", ...cardioFields(block.exercise), "kcal"]
  const [reading, setReading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<Field, string>>(() => draftOf(actual ?? plan))

  async function snap(file: File | undefined) {
    if (!file) return
    setReading(true)
    try {
      // A bit bigger than meal photos so small digits stay readable.
      const img = await prepareImage(file, { maxSide: 1280 })
      URL.revokeObjectURL(img.previewUrl)
      const { reading: r } = await api.post<CardioScreenResponse>("ai/cardio-screen", {
        image: { media_type: img.mediaType, data: img.data },
        exercise: block.exercise.name,
      })
      if (!r.found) {
        toast("Couldn't read that screen. Try again closer, or type it.")
        return
      }
      const next: Cardio = {
        minutes: r.minutes ?? plan.minutes,
        incline: r.incline,
        speed: r.speed,
        level: r.level,
        distance_km: r.distance_km,
        kcal: r.kcal,
      }
      setDraft(draftOf(next))
      onCardio(true, next)
      toast.success(`Saved: ${cardioText(next)}${r.note ? `. ${r.note}` : ""}`)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setReading(false)
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault()
    const minutes = parseDecimal(draft.minutes)
    if (minutes == null || minutes < 0) {
      toast.error("Set the minutes")
      return
    }
    const get = (f: Field) => (fields.includes(f) ? parseDecimal(draft[f]) : null)
    onCardio(true, { minutes, incline: get("incline"), speed: get("speed"), level: get("level"), distance_km: get("distance_km"), kcal: get("kcal") })
    setEditing(false)
  }

  return (
    <div className="flex flex-col gap-2">
      {actual ? (
        <p className="m-0 rounded-tile bg-pink-soft/60 px-3 py-2 text-[14px]">
          <span className="font-bold">Done:</span> {cardioText(actual)}
        </p>
      ) : null}

      {editing ? (
        <form onSubmit={save} className="flex flex-col gap-2">
          <div className="grid grid-cols-3 gap-2">
            {fields.map((f) => (
              <label key={f} className="flex flex-col gap-1 text-[12px] text-muted">
                {CARDIO_FIELD_LABEL[f]}
                <input
                  inputMode="decimal"
                  value={draft[f]}
                  onChange={(e) => setDraft((d) => ({ ...d, [f]: e.target.value }))}
                  className="min-h-[44px] w-full min-w-0 rounded-[10px] border border-line px-2.5 text-[15px] font-bold text-ink"
                />
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" size="md" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button type="submit" size="md">
              Save
            </Button>
          </div>
        </form>
      ) : (
        <>
          <button
            type="button"
            aria-pressed={block.cardio_done}
            onClick={() => onCardio(!block.cardio_done)}
            className={cn(
              "flex min-h-[48px] items-center justify-center gap-2 rounded-tile text-[15px] font-bold",
              block.cardio_done ? "bg-ink text-pink" : "border border-ink"
            )}
          >
            <CheckIcon size={18} /> {block.cardio_done ? "Done" : `Mark ${cardioText(plan)} done`}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <label
              className={cn(
                "flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-tile border border-line text-[14px] font-semibold focus-within:outline-2 focus-within:outline-ink",
                reading && "pointer-events-none opacity-60"
              )}
            >
              {reading ? <Spinner size={16} /> : <CameraIcon size={18} />}
              {reading ? "Reading…" : "Snap the screen"}
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void snap(e.target.files?.[0])} />
            </label>
            <button
              type="button"
              onClick={() => {
                setDraft(draftOf(actual ?? plan))
                setEditing(true)
              }}
              className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-tile border border-line text-[14px] font-semibold"
            >
              <PencilIcon size={16} /> Type it
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function draftOf(c: Cardio): Record<Field, string> {
  const s = (v: number | null | undefined) => (v != null ? String(v) : "")
  return { minutes: s(c.minutes), incline: s(c.incline), speed: s(c.speed), level: s(c.level), distance_km: s(c.distance_km), kcal: s(c.kcal) }
}
