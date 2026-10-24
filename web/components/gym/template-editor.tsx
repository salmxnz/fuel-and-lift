"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useRouter } from "next/navigation"
import { useEffect, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Button, ErrorCard, LoadingBlock, PageHeader, Switch } from "@/components/ui/primitives"
import {
  BackIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CloseIcon,
  PlusIcon,
  ShareIcon,
  TrashIcon,
} from "@/components/ui/icons"
import { ShareTemplateSheet } from "@/components/share/share-template-sheet"
import { VisibilitySelect } from "@/components/community/visibility-select"
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
import { PAGE_SLIDE, pageVariants, swipeDirection } from "@/lib/motion"
import { ExerciseIcon } from "./exercise-icon"
import { ExercisePicker } from "./exercise-picker"
import { QuickAddSets } from "./quick-add-sets"

type SetDraft = { key: string; warmup: boolean; kg: string; reps: string; toFailure: boolean }
type BlockDraft = {
  key: string
  exercise: Exercise
  sets: SetDraft[]
  cardio: { minutes: string; incline: string; speed: string } | null
  rest: string
  notes: string
}

/** The API allows 12 sets per exercise. */
const MAX_SETS = 12

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
  // null = the current version (editable); a number = an older/newer one (read-only).
  const [viewing, setViewing] = useState<number | null>(null)
  const [dir, setDir] = useState(0)
  const [dirty, setDirty] = useState(false)
  const reduce = useReducedMotion()

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

  const current = detail.data.template
  const all = detail.data.versions.map((v) => v.version).sort((a, b) => a - b)
  if (!all.includes(current.version)) all.push(current.version)
  const shown = viewing ?? current.version
  const idx = all.indexOf(shown)
  const nextVersion = Math.max(...all) + 1

  function go(d: -1 | 1) {
    if (dirty) {
      toast("Save or undo your changes first, then browse versions.")
      return
    }
    const v = all[idx + d]
    if (v == null) return
    setDir(d)
    setViewing(v === current.version ? null : v)
  }

  const pager =
    all.length > 1 ? (
      <VersionPager
        version={shown}
        index={idx}
        count={all.length}
        isCurrent={shown === current.version}
        onPrev={idx > 0 ? () => go(-1) : undefined}
        onNext={idx < all.length - 1 ? () => go(1) : undefined}
      />
    ) : null

  return (
    <AnimatePresence mode="popLayout" initial={false} custom={dir}>
      <motion.div
        key={shown}
        custom={dir}
        variants={reduce ? undefined : pageVariants}
        initial={reduce ? { opacity: 0 } : "enter"}
        animate={reduce ? { opacity: 1 } : "center"}
        exit={reduce ? { opacity: 0 } : "exit"}
        transition={PAGE_SLIDE}
        // Swipe left/right through versions; locked while there are unsaved edits.
        drag={all.length > 1 && !dirty ? "x" : false}
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        onDragEnd={(_, info) => {
          const d = swipeDirection(info.offset.x, info.velocity.x, window.innerWidth)
          if (d !== 0) go(d)
        }}
      >
        {viewing == null ? (
          <Editor
            key={current.version_id}
            template={current}
            nextVersion={nextVersion}
            pager={pager}
            onDirtyChange={setDirty}
            onSaved={(t) => {
              setDirty(false)
              detail.setData((prev) => ({
                template: t,
                versions: [{ version: t.version, version_id: t.version_id, created_at: t.updated_at }, ...(prev?.versions ?? [])],
              }))
            }}
          />
        ) : (
          <VersionPreview
            id={current.id}
            version={viewing}
            name={current.name}
            currentVersion={current.version}
            pager={pager}
            onMadeCurrent={(t) => {
              detail.setData((prev) => ({ template: t, versions: prev?.versions ?? [] }))
              setViewing(null)
            }}
            onBackToCurrent={() => {
              setDir(viewing < current.version ? 1 : -1)
              setViewing(null)
            }}
          />
        )}
      </motion.div>
    </AnimatePresence>
  )
}

function VersionPager({
  version,
  index,
  count,
  isCurrent,
  onPrev,
  onNext,
}: {
  version: number
  index: number
  count: number
  isCurrent: boolean
  onPrev?: () => void
  onNext?: () => void
}) {
  return (
    <nav aria-label="Template versions" className="flex items-center gap-1 rounded-tile bg-white p-1">
      <button
        type="button"
        aria-label="Older version"
        disabled={!onPrev}
        onClick={onPrev}
        className="flex h-10 w-10 items-center justify-center rounded-[10px] text-ink transition-transform duration-150 active:scale-[0.97] disabled:opacity-25"
      >
        <BackIcon size={18} />
      </button>
      <span className="flex flex-1 flex-col items-center text-center">
        <span className="text-[14px] font-extrabold">
          v{version} <span className="font-semibold text-muted">· {index + 1} of {count}</span>
        </span>
        <span className={cn("text-[11px] font-semibold", isCurrent ? "text-protein" : "text-muted")}>
          {isCurrent ? "Current: workouts start from this" : "Older version: swipe or tap to browse"}
        </span>
      </span>
      <button
        type="button"
        aria-label="Newer version"
        disabled={!onNext}
        onClick={onNext}
        className="flex h-10 w-10 items-center justify-center rounded-[10px] text-ink transition-transform duration-150 active:scale-[0.97] disabled:opacity-25"
      >
        <ChevronRightIcon size={18} />
      </button>
    </nav>
  )
}

/** A non-current version, read-only, with "Set as current". */
function VersionPreview({
  id,
  version,
  name,
  currentVersion,
  pager,
  onMadeCurrent,
  onBackToCurrent,
}: {
  id: string
  version: number
  name: string
  currentVersion: number
  pager: ReactNode
  onMadeCurrent: (t: Template) => void
  onBackToCurrent: () => void
}) {
  const res = useApi<TemplateResponse>(`templates/${seg(id)}/versions/${version}`)
  const [busy, setBusy] = useState(false)
  const t = res.data?.template

  async function makeCurrent() {
    setBusy(true)
    try {
      const out = await api.post<TemplateResponse>(`templates/${seg(id)}/current`, { version })
      toast.success(`${out.template.name} v${version} is current now`)
      onMadeCurrent(out.template)
    } catch (err) {
      toast.error(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <main className="app-column pb-safe flex min-h-dvh flex-col gap-3">
      <PageHeader back="/gym" backLabel="Back to Gym" eyebrow="Template" title={name} />
      {pager}
      {res.error && !t ? <ErrorCard message={res.error.message} onRetry={() => void res.reload()} /> : null}
      {!t && !res.error ? <LoadingBlock label={`Loading v${version}`} /> : null}
      {t ? (
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {[...t.blocks]
            .sort((a, b) => a.position - b.position)
            .map((b, i) => (
              <li key={b.id} className="flex flex-col gap-0.5 rounded-card bg-white p-3.5">
                <span className="text-[12px] text-muted">
                  {i + 1}. {b.exercise.muscle_group ?? (b.exercise.kind === "cardio" ? "Cardio" : "Exercise")}
                </span>
                <span className="text-[17px] font-extrabold tracking-[-0.01em]">{b.exercise.name}</span>
                <span className="text-[14px] text-ink-soft">{blockSummary(b.sets, b.cardio)}</span>
              </li>
            ))}
        </ol>
      ) : null}
      <div className="mt-auto flex flex-col gap-2 pt-2">
        <Button onClick={makeCurrent} loading={busy} disabled={!t}>
          Set v{version} as current
        </Button>
        <Button variant="ghost" size="md" onClick={onBackToCurrent}>
          Back to v{currentVersion} (current)
        </Button>
      </div>
    </main>
  )
}

function blockSummary(sets: PlannedSet[], cardio: Cardio | null): string {
  if (cardio) {
    return [`${cardio.minutes} min`, cardio.incline != null ? `incline ${cardio.incline}` : null, cardio.speed != null ? `speed ${cardio.speed}` : null]
      .filter(Boolean)
      .join(", ")
  }
  const warm = sets.filter((s) => s.warmup).length
  const work = sets.filter((s) => !s.warmup)
  const parts = work.map((s) => `${s.to_failure ? "to failure" : `${s.target_reps ?? "?"} reps`}${s.target_kg != null ? ` @ ${s.target_kg} kg` : ""}`)
  // Collapse identical sets: "3 × 10 reps @ 40 kg".
  const groups: string[] = []
  for (let i = 0; i < parts.length; ) {
    let j = i
    while (j < parts.length && parts[j] === parts[i]) j++
    groups.push(j - i > 1 ? `${j - i} × ${parts[i]}` : parts[i])
    i = j
  }
  return [warm ? `${warm} warm-up` : null, ...groups].filter(Boolean).join(", ") || "No sets"
}

function Editor({
  template,
  nextVersion,
  pager,
  onSaved,
  onDirtyChange,
}: {
  template: Template
  nextVersion: number
  pager: ReactNode
  onSaved: (t: Template) => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const router = useRouter()
  const initial = draftFrom(template)
  const [name, setName] = useState(initial.name)
  const [blocks, setBlocks] = useState<BlockDraft[]>(initial.blocks)
  const [dirty, setDirty] = useState(false)
  const [picker, setPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [visibility, setVisibility] = useState(template.visibility)

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])

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
        eyebrow={`Template · v${template.version}${template.copied_from ? ` · from ${template.copied_from.name}` : ""}`}
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
        right={
          <button
            type="button"
            aria-label={`Share ${template.name} with a friend`}
            onClick={() => setShareOpen(true)}
            className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-white text-ink transition-transform duration-[160ms] ease-out active:scale-[0.97]"
          >
            <ShareIcon size={20} />
          </button>
        }
      />

      <ShareTemplateSheet template={template} open={shareOpen} unsaved={dirty} onClose={() => setShareOpen(false)} />

      {pager}

      {blocks.length === 0 ? (
        <div className="rounded-card border-[1.5px] border-dashed border-dash p-4 text-[15px] text-muted">
          No exercises yet. Add the first one below.
        </div>
      ) : null}

      <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
        {blocks.map((b, i) => (
          <li key={b.key} className="flex flex-col gap-3 rounded-card bg-white p-3.5">
            <div className="flex items-start gap-2">
              <ExerciseIcon exercise={b.exercise} size={44} className="rounded-[12px]" />
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
                <QuickAddSets
                  key={b.sets.length}
                  remaining={MAX_SETS - b.sets.length}
                  defaultReps={[...b.sets].reverse().find((x) => !x.warmup && !x.toFailure)?.reps ?? "10"}
                  defaultKg={[...b.sets].reverse().find((x) => !x.warmup)?.kg ?? ""}
                  onAdd={(count, reps, kg) =>
                    patchBlock(b.key, {
                      sets: [
                        ...b.sets,
                        ...Array.from({ length: Math.min(count, MAX_SETS - b.sets.length) }, () => ({
                          key: k(),
                          warmup: false,
                          kg: kg != null ? String(kg) : "",
                          reps: reps != null ? String(reps) : "",
                          toFailure: reps == null,
                        })),
                      ],
                    })
                  }
                />
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

      <section aria-label="Sharing" className="rounded-card bg-white p-3.5">
        <VisibilitySelect
          value={visibility}
          onChange={setVisibility}
          path={`templates/${seg(template.id)}/visibility`}
          hidden={template.hidden}
          note="They see your last saved version."
        />
      </section>

      <Button variant="danger" size="md" onClick={remove} loading={deleting}>
        {confirmDelete ? "Tap again to archive this template" : "Archive template"}
      </Button>

      <div
        className="sticky bottom-0 -mx-4 mt-auto bg-gradient-to-t from-ground from-70% to-transparent px-4 pt-4"
        style={{ paddingBottom: "calc(var(--safe-bottom) + 20px)" }}
      >
        <Button onClick={save} loading={saving} disabled={!dirty} className="w-full">
          {dirty ? `Save as ${name.trim() || template.name} v${nextVersion}` : "Saved"}
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
