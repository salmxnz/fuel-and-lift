"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { Button, ErrorCard, LoadingBlock, PageHeader, Switch } from "@/components/ui/primitives"
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, PlusIcon, TrashIcon } from "@/components/ui/icons"
import { api, errorMessage, seg } from "@/lib/api/client"
import type {
  Cardio,
  Exercise,
  PlannedSet,
  Template,
  TemplateDetailResponse,
  TemplateRequest,
  TemplateResponse,
} from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { cn } from "@/lib/cn"
import { parseDecimal } from "@/lib/format"
import { ExercisePicker } from "./exercise-picker"

type SetDraft = { key: string; warmup: boolean; kg: string; reps: string; toFailure: boolean }
type BlockDraft = {
  key: string
  exercise: Exercise
  sets: SetDraft[]
  cardio: { minutes: string; incline: string; speed: string } | null
  rest: string
  notes: string
}

let keySeq = 0
const k = () => `b${++keySeq}`

function setFrom(s: PlannedSet): SetDraft {
  return {
    key: k(),
    warmup: s.warmup,
    kg: s.target_kg != null ? String(s.target_kg) : "",
    reps: s.target_reps != null ? String(s.target_reps) : "",
    toFailure: s.to_failure,
  }
}

function draftFrom(t: Template): { name: string; blocks: BlockDraft[] } {
  return {
    name: t.name,
    blocks: [...t.blocks]
      .sort((a, b) => a.position - b.position)
      .map((b) => ({
        key: k(),
        exercise: b.exercise,
        sets: b.sets.map(setFrom),
        cardio: b.cardio
          ? {
              minutes: String(b.cardio.minutes),
              incline: b.cardio.incline != null ? String(b.cardio.incline) : "",
              speed: b.cardio.speed != null ? String(b.cardio.speed) : "",
            }
          : null,
        rest: b.rest_seconds != null ? String(b.rest_seconds) : "",
        notes: b.notes ?? "",
      })),
  }
}

function newBlock(ex: Exercise): BlockDraft {
  return ex.kind === "cardio"
    ? { key: k(), exercise: ex, sets: [], cardio: { minutes: "10", incline: "", speed: "" }, rest: "", notes: "" }
    : {
        key: k(),
        exercise: ex,
        sets: [
          { key: k(), warmup: true, kg: "", reps: "12", toFailure: false },
          { key: k(), warmup: false, kg: "", reps: "", toFailure: true },
          { key: k(), warmup: false, kg: "", reps: "", toFailure: true },
        ],
        cardio: null,
        rest: "90",
        notes: "",
      }
}

function toRequest(name: string, blocks: BlockDraft[]): TemplateRequest | string {
  const out: TemplateRequest = { name: name.trim(), blocks: [] }
  if (!out.name) return "Give the template a name"
  for (const b of blocks) {
    let cardio: Cardio | null = null
    if (b.cardio) {
      const minutes = parseDecimal(b.cardio.minutes)
      if (minutes == null || minutes <= 0) return `Set the minutes for ${b.exercise.name}`
      cardio = { minutes, incline: parseDecimal(b.cardio.incline), speed: parseDecimal(b.cardio.speed) }
    }
    const sets: PlannedSet[] = b.sets.map((s) => ({
      warmup: s.warmup,
      target_kg: parseDecimal(s.kg),
      target_reps: s.toFailure ? null : parseDecimal(s.reps),
      to_failure: s.toFailure,
    }))
    if (!b.cardio && sets.length === 0) return `Add at least one set to ${b.exercise.name}`
    const rest = parseDecimal(b.rest)
    out.blocks.push({
      exercise_id: b.exercise.id,
      sets,
      cardio,
      rest_seconds: rest != null ? Math.round(rest) : null,
      notes: b.notes.trim() || null,
    })
  }
  return out
}

export function TemplateEditor({ id }: { id: string }) {
  const detail = useApi<TemplateDetailResponse>(`templates/${seg(id)}`)
  if (detail.error && !detail.data) {
    return (
      <main className="app-column pb-safe flex flex-col gap-4">
        <PageHeader back="/gym" title="Template" />
        <ErrorCard message={detail.error.message} onRetry={() => void detail.reload()} />
      </main>
    )
  }
  if (!detail.data) {
    return (
      <main className="app-column">
        <LoadingBlock label="Loading template" />
      </main>
    )
  }
  return (
    <Editor
      key={detail.data.template.version_id}
      template={detail.data.template}
      versions={detail.data.versions.length}
      onSaved={(t) => detail.setData((prev) => ({ template: t, versions: prev?.versions ?? [] }))}
    />
  )
}

function Editor({ template, versions, onSaved }: { template: Template; versions: number; onSaved: (t: Template) => void }) {
  const router = useRouter()
  const initial = draftFrom(template)
  const [name, setName] = useState(initial.name)
  const [blocks, setBlocks] = useState<BlockDraft[]>(initial.blocks)
  const [dirty, setDirty] = useState(false)
  const [picker, setPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function update(next: BlockDraft[]) {
    setBlocks(next)
    setDirty(true)
  }
  function patchBlock(key: string, p: Partial<BlockDraft>) {
    update(blocks.map((b) => (b.key === key ? { ...b, ...p } : b)))
  }
  function patchSet(bk: string, sk: string, p: Partial<SetDraft>) {
    update(blocks.map((b) => (b.key === bk ? { ...b, sets: b.sets.map((s) => (s.key === sk ? { ...s, ...p } : s)) } : b)))
  }
  function moveBlock(i: number, d: -1 | 1) {
    const j = i + d
    if (j < 0 || j >= blocks.length) return
    const next = [...blocks]
    ;[next[i], next[j]] = [next[j], next[i]]
    update(next)
  }

  async function save() {
    const body = toRequest(name, blocks)
    if (typeof body === "string") {
      toast.error(body)
      return
    }
    setSaving(true)
    try {
      const res = await api.put<TemplateResponse>(`templates/${seg(template.id)}`, body)
      toast.success(`Saved as ${res.template.name} v${res.template.version}`)
      setDirty(false)
      onSaved(res.template)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setDeleting(true)
    try {
      await api.del(`templates/${seg(template.id)}`)
      toast.success(`${template.name} archived. Its history stays.`)
      router.push("/gym")
    } catch (err) {
      toast.error(errorMessage(err))
      setDeleting(false)
    }
  }

  return (
    <main className="app-column flex min-h-dvh flex-col gap-3">
      <PageHeader
        back="/gym"
        backLabel="Back to Gym"
        eyebrow={`Template · v${template.version}${versions > 1 ? ` of ${versions}` : ""}`}
        title={
          <label className="block">
            <span className="sr-only">Template name</span>
            <input
              value={name}
              maxLength={40}
              onChange={(e) => {
                setName(e.target.value)
                setDirty(true)
              }}
              className="w-full bg-transparent text-[24px] font-extrabold tracking-[-0.02em] outline-none"
            />
          </label>
        }
      />

      {blocks.length === 0 ? (
        <div className="rounded-card border-[1.5px] border-dashed border-dash p-4 text-[15px] text-muted">
          No exercises yet. Add the first one below.
        </div>
      ) : null}

      <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
        {blocks.map((b, i) => (
          <li key={b.key} className="flex flex-col gap-3 rounded-card bg-white p-3.5">
            <div className="flex items-start gap-2">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-[12px] text-muted">
                  {i + 1}. {b.exercise.muscle_group ?? (b.exercise.kind === "cardio" ? "Cardio" : "Exercise")}
                </span>
                <h2 className="m-0 truncate text-[18px] font-extrabold tracking-[-0.01em]">{b.exercise.name}</h2>
              </div>
              <IconBtn label={`Move ${b.exercise.name} up`} onClick={() => moveBlock(i, -1)} disabled={i === 0}>
                <ChevronUpIcon size={18} />
              </IconBtn>
              <IconBtn label={`Move ${b.exercise.name} down`} onClick={() => moveBlock(i, 1)} disabled={i === blocks.length - 1}>
                <ChevronDownIcon size={18} />
              </IconBtn>
              <IconBtn label={`Remove ${b.exercise.name}`} onClick={() => update(blocks.filter((x) => x.key !== b.key))}>
                <TrashIcon size={18} />
              </IconBtn>
            </div>

            {b.cardio ? (
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["minutes", "Minutes"],
                    ["incline", "Incline"],
                    ["speed", "Speed"],
                  ] as const
                ).map(([f, label]) => (
                  <label key={f} className="flex flex-col gap-1 text-[12px] text-muted">
                    {label}
                    <input
                      inputMode="decimal"
                      value={b.cardio![f]}
                      onChange={(e) => patchBlock(b.key, { cardio: { ...b.cardio!, [f]: e.target.value } })}
                      className="min-h-[44px] rounded-[10px] border border-line px-2.5 text-[15px] font-bold text-ink"
                    />
                  </label>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <div className="grid grid-cols-[64px_1fr_1fr_36px] items-center gap-2 text-[12px] text-muted">
                  <span>Warm-up</span>
                  <span>Target kg</span>
                  <span>Reps</span>
                  <span />
                </div>
                {b.sets.map((s, si) => {
                  const n = b.sets.slice(0, si + 1).filter((x) => !x.warmup).length
                  const label = s.warmup ? "Warm-up" : `Set ${n}`
                  return (
                    <div key={s.key} className="grid grid-cols-[64px_1fr_1fr_36px] items-center gap-2">
                      <span className="flex items-center">
                        <Switch checked={s.warmup} onChange={(v) => patchSet(b.key, s.key, { warmup: v })} label={`${label}: warm-up`} />
                      </span>
                      <input
                        inputMode="decimal"
                        aria-label={`${label} target kg`}
                        value={s.kg}
                        placeholder="kg"
                        onChange={(e) => patchSet(b.key, s.key, { kg: e.target.value })}
                        className="min-h-[40px] w-full min-w-0 rounded-[10px] border border-line px-2.5 font-bold"
                      />
                      {s.toFailure ? (
                        <button
                          type="button"
                          aria-label={`${label}: to failure. Tap to set reps`}
                          onClick={() => patchSet(b.key, s.key, { toFailure: false })}
                          className="min-h-[40px] rounded-[10px] bg-field px-2 text-left text-[14px] text-muted"
                        >
                          to failure
                        </button>
                      ) : (
                        <div className="flex min-w-0 items-center gap-1">
                          <input
                            inputMode="numeric"
                            aria-label={`${label} target reps`}
                            value={s.reps}
                            placeholder="reps"
                            onChange={(e) => patchSet(b.key, s.key, { reps: e.target.value })}
                            className="min-h-[40px] w-full min-w-0 rounded-[10px] border border-line px-2.5"
                          />
                          <button
                            type="button"
                            aria-label={`${label}: to failure`}
                            title="To failure"
                            onClick={() => patchSet(b.key, s.key, { toFailure: true, reps: "" })}
                            className="flex h-10 w-8 flex-none items-center justify-center rounded-[10px] text-[12px] font-bold text-muted"
                          >
                            F
                          </button>
                        </div>
                      )}
                      <button
                        type="button"
                        aria-label={`Remove ${label}`}
                        onClick={() => patchBlock(b.key, { sets: b.sets.filter((x) => x.key !== s.key) })}
                        className="flex h-10 w-9 items-center justify-center text-muted"
                      >
                        <CloseIcon size={16} />
                      </button>
                    </div>
                  )
                })}
                <button
                  type="button"
                  onClick={() => {
                    const last = b.sets[b.sets.length - 1]
                    patchBlock(b.key, {
                      sets: [
                        ...b.sets,
                        { key: k(), warmup: false, kg: last?.kg ?? "", reps: last?.warmup ? "" : (last?.reps ?? ""), toFailure: last ? last.toFailure && !last.warmup : true },
                      ],
                    })
                  }}
                  className="flex min-h-[40px] items-center gap-1.5 self-start text-[13px] font-semibold text-protein"
                >
                  <PlusIcon size={16} /> Add set
                </button>
              </div>
            )}

            <div className="grid grid-cols-[110px_1fr] gap-2">
              {!b.cardio ? (
                <label className="flex flex-col gap-1 text-[12px] text-muted">
                  Rest (sec)
                  <input
                    inputMode="numeric"
                    value={b.rest}
                    onChange={(e) => patchBlock(b.key, { rest: e.target.value })}
                    className="min-h-[40px] rounded-[10px] border border-line px-2.5 text-[15px] text-ink"
                  />
                </label>
              ) : null}
              <label className={cn("flex flex-col gap-1 text-[12px] text-muted", b.cardio && "col-span-2")}>
                Notes
                <input
                  value={b.notes}
                  maxLength={200}
                  placeholder="Seat at 4, slow negatives"
                  onChange={(e) => patchBlock(b.key, { notes: e.target.value })}
                  className="min-h-[40px] rounded-[10px] border border-line px-2.5 text-[15px] text-ink"
                />
              </label>
            </div>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={() => setPicker(true)}
        className="flex min-h-[52px] items-center justify-center gap-2 rounded-btn border-[1.5px] border-dashed border-dash text-[15px] font-bold"
      >
        <PlusIcon size={18} /> Add exercise
      </button>

      <Button variant="danger" size="md" onClick={remove} loading={deleting}>
        {confirmDelete ? "Tap again to archive this template" : "Archive template"}
      </Button>

      <div
        className="sticky bottom-0 -mx-4 mt-auto bg-gradient-to-t from-ground from-70% to-transparent px-4 pt-4"
        style={{ paddingBottom: "calc(var(--safe-bottom) + 20px)" }}
      >
        <Button onClick={save} loading={saving} disabled={!dirty} className="w-full">
          {dirty ? `Save as ${name.trim() || template.name} v${template.version + 1}` : "Saved"}
        </Button>
      </div>

      <ExercisePicker
        open={picker}
        onClose={() => setPicker(false)}
        onPick={(ex) => {
          update([...blocks, newBlock(ex)])
          setPicker(false)
        }}
      />
    </main>
  )
}

function IconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-11 w-9 flex-none items-center justify-center rounded-[10px] text-muted disabled:opacity-30"
    >
      {children}
    </button>
  )
}
