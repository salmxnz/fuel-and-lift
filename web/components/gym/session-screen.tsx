"use client"

import Link from "next/link"
import { motion, useReducedMotion, type PanInfo } from "motion/react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { ErrorCard, LoadingBlock, PageHeader, Spinner } from "@/components/ui/primitives"
import { CardioArt, CheckIcon, MachineArt } from "@/components/ui/icons"
import { api, errorMessage, seg } from "@/lib/api/client"
import type { Session, SessionBlock, SessionResponse, SessionSet, TemplateDetailResponse } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { cn } from "@/lib/cn"
import { weekdayName } from "@/lib/dates"
import { num1, parseDecimal } from "@/lib/format"
import { ExercisePicker } from "./exercise-picker"
import { RestTimerPill, useRestTimer } from "./rest-timer"
import { blockDone, blockPlanText, blockSummary, cardioText, ordinal } from "./session-helpers"

const DEFAULT_REST = 90
const SWIPE_SKIP_PX = 90

type Drafts = Record<string, { kg: string; reps: string }>

export function SessionScreen({ id }: { id: string }) {
  const session = useApi<SessionResponse>(`sessions/${seg(id)}`)
  const s = session.data?.session
  const tpl = useApi<TemplateDetailResponse>(s?.template_id ? `templates/${seg(s.template_id)}` : null)
  const timer = useRestTimer()
  const reduce = useReducedMotion()

  const [expanded, setExpanded] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Drafts>({})
  const [pending, setPending] = useState<Record<string, boolean>>({})
  const [undo, setUndo] = useState<{ blockId: string; name: string } | null>(null)
  const [picker, setPicker] = useState(false)

  // Hide the undo banner after a while.
  useEffect(() => {
    if (!undo) return
    const t = window.setTimeout(() => setUndo(null), 8000)
    return () => window.clearTimeout(t)
  }, [undo])

  const restByExercise = useMemo(() => {
    const m = new Map<string, number>()
    for (const b of tpl.data?.template.blocks ?? []) {
      if (b.rest_seconds != null && !m.has(b.exercise.id)) m.set(b.exercise.id, b.rest_seconds)
    }
    return m
  }, [tpl.data])

  if (session.error && !s) {
    return (
      <main className="app-column pb-safe flex flex-col gap-4">
        <PageHeader back="/gym" title="Workout" />
        <ErrorCard message={session.error.message} onRetry={() => void session.reload()} />
      </main>
    )
  }
  if (!s) {
    return (
      <main className="app-column">
        <LoadingBlock label="Loading workout" />
      </main>
    )
  }

  const blocks = [...s.blocks].sort((a, b) => a.position - b.position)
  const autoCurrent = blocks.find((b) => !blockDone(b))?.id ?? null
  const currentId = expanded && blocks.some((b) => b.id === expanded && !b.skipped) ? expanded : autoCurrent
  const finished = s.status === "finished"

  function apply(next: Session) {
    session.setData({ session: next })
  }

  function optimistic(mutator: (draft: Session) => Session) {
    session.setData((prev) => (prev ? { session: mutator(prev.session) } : prev!))
  }

  async function call(key: string, fn: () => Promise<SessionResponse>, rollback: Session) {
    setPending((p) => ({ ...p, [key]: true }))
    try {
      const res = await fn()
      apply(res.session)
      return true
    } catch (err) {
      apply(rollback)
      toast.error(errorMessage(err))
      return false
    } finally {
      setPending((p) => {
        const n = { ...p }
        delete n[key]
        return n
      })
    }
  }

  function draftFor(set: SessionSet) {
    return (
      drafts[set.id] ?? {
        kg: set.actual_kg != null ? String(set.actual_kg) : set.target_kg != null ? String(set.target_kg) : "",
        reps: set.actual_reps != null ? String(set.actual_reps) : "",
      }
    )
  }

  async function toggleSet(block: SessionBlock, set: SessionSet) {
    if (!s) return
    const before = s
    const d = draftFor(set)
    const done = !set.done
    const kg = parseDecimal(d.kg)
    const reps = parseDecimal(d.reps)
    const body = done
      ? { done: true, actual_kg: kg ?? set.target_kg, actual_reps: reps != null ? Math.round(reps) : set.target_reps }
      : { done: false }
    optimistic((x) => ({
      ...x,
      blocks: x.blocks.map((b) =>
        b.id !== block.id
          ? b
          : { ...b, sets: b.sets.map((y) => (y.id === set.id ? { ...y, done, ...(done ? { actual_kg: body.actual_kg ?? null, actual_reps: body.actual_reps ?? null } : {}) } : y)) }
      ),
    }))
    if (done) {
      timer.start(restByExercise.get(block.exercise.id) ?? DEFAULT_REST)
      try {
        navigator.vibrate?.(15)
      } catch {
        /* ignore */
      }
    }
    await call(`set-${set.id}`, () => api.patch<SessionResponse>(`sessions/${seg(s.id)}/sets/${seg(set.id)}`, body), before)
  }

  async function setSkipped(block: SessionBlock, skipped: boolean) {
    if (!s) return
    const before = s
    optimistic((x) => ({ ...x, blocks: x.blocks.map((b) => (b.id === block.id ? { ...b, skipped } : b)) }))
    if (skipped) {
      setUndo({ blockId: block.id, name: block.exercise.name })
      if (expanded === block.id) setExpanded(null)
    } else setUndo(null)
    await call(
      `block-${block.id}`,
      () => api.patch<SessionResponse>(`sessions/${seg(s.id)}/blocks/${seg(block.id)}`, { skipped }),
      before
    )
  }

  async function cardioDone(block: SessionBlock, done: boolean) {
    if (!s) return
    const before = s
    optimistic((x) => ({ ...x, blocks: x.blocks.map((b) => (b.id === block.id ? { ...b, cardio_done: done } : b)) }))
    await call(
      `block-${block.id}`,
      () => api.patch<SessionResponse>(`sessions/${seg(s.id)}/blocks/${seg(block.id)}`, { cardio_done: done }),
      before
    )
  }

  async function extraSet(block: SessionBlock) {
    if (!s) return
    const work = block.sets.filter((x) => !x.warmup)
    const last = work[work.length - 1] ?? block.sets[block.sets.length - 1]
    await call(
      `extra-${block.id}`,
      () =>
        api.post<SessionResponse>(`sessions/${seg(s.id)}/blocks/${seg(block.id)}/sets`, {
          warmup: false,
          target_kg: last?.actual_kg ?? last?.target_kg ?? null,
          target_reps: last?.to_failure ? null : (last?.target_reps ?? null),
          to_failure: last?.to_failure ?? false,
        }),
      s
    )
  }

  return (
    <main className="app-column flex min-h-dvh flex-col gap-3" style={{ paddingBottom: "calc(var(--safe-bottom) + 110px)" }}>
      <PageHeader
        back="/gym"
        backLabel="Back to Gym"
        eyebrow={weekdayName(s.date)}
        title={
          <>
            {s.template_name ?? "Workout"}{" "}
            {s.template_version ? (
              <span className="align-middle text-[13px] font-semibold text-muted">v{s.template_version}</span>
            ) : null}
          </>
        }
      />

      {finished ? (
        <div role="status" className="flex items-center justify-between gap-2 rounded-[12px] bg-mint px-3 py-2 text-[13px]">
          <span>This workout is finished.</span>
          <Link href="/gym" className="font-bold">
            Back to Gym
          </Link>
        </div>
      ) : undo ? (
        <div role="status" className="flex items-center justify-between gap-2 rounded-[12px] bg-warn-bg px-3 py-2 text-[13px]">
          <span>{undo.name} removed for today only</span>
          <button
            type="button"
            onClick={() => {
              const b = s.blocks.find((x) => x.id === undo.blockId)
              if (b) void setSkipped(b, false)
            }}
            className="min-h-[32px] px-2 text-[13px] font-bold underline"
          >
            Undo
          </button>
        </div>
      ) : null}

      {blocks.length === 0 ? (
        <div className="rounded-card border-[1.5px] border-dashed border-dash p-4 text-[15px] text-muted">
          This workout has no exercises. Add some to the template first.
        </div>
      ) : null}

      <ol aria-label="Exercises" className="relative m-0 flex list-none flex-col gap-2.5 p-0">
        {blocks.map((b, i) => {
          const isLast = i === blocks.length - 1
          const isCurrent = b.id === currentId && !finished
          const done = blockDone(b) && !b.skipped
          return (
            <li key={b.id} aria-current={isCurrent ? "step" : undefined} className={cn("flex gap-3", b.skipped && "opacity-55")}>
              <div className="flex w-7 flex-none flex-col items-center">
                <span
                  aria-hidden="true"
                  className={cn(
                    "box-border rounded-full",
                    b.skipped
                      ? "mt-2.5 h-3.5 w-3.5 border-2 border-dashed border-muted"
                      : isCurrent
                        ? "mt-4 h-[18px] w-[18px] border-2 border-ink bg-lime"
                        : done
                          ? "mt-[18px] flex h-3.5 w-3.5 items-center justify-center bg-ink"
                          : "mt-[18px] h-3.5 w-3.5 border-2 border-muted bg-ground"
                  )}
                />
                {!isLast ? <span className="mt-1 w-0.5 flex-1 bg-line" /> : null}
              </div>

              {b.skipped ? (
                <button
                  type="button"
                  onClick={() => !finished && setSkipped(b, false)}
                  disabled={finished}
                  aria-label={`${b.exercise.name}, skipped today. Tap to bring it back`}
                  className="flex min-h-[44px] flex-1 items-baseline justify-between py-1.5 text-left"
                >
                  <span className="text-[15px] font-semibold line-through">{b.exercise.name}</span>
                  <span className="text-[13px] text-muted">{b.cardio ? cardioText(b.cardio) : blockSummary(b).text}</span>
                </button>
              ) : (
                <motion.div
                  className="min-w-0 flex-1 touch-pan-y"
                  drag={finished || reduce ? false : "x"}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={{ left: 0.6, right: 0.05 }}
                  dragSnapToOrigin
                  onDragEnd={(_e: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
                    if (info.offset.x < -SWIPE_SKIP_PX) void setSkipped(b, true)
                  }}
                >
                  {isCurrent ? (
                    <CurrentBlock
                      block={b}
                      draftFor={draftFor}
                      setDraft={(setId, d) => setDrafts((all) => ({ ...all, [setId]: d }))}
                      pending={pending}
                      onToggle={(set) => toggleSet(b, set)}
                      onExtra={() => extraSet(b)}
                      onSkip={() => setSkipped(b, true)}
                      onCardio={(v) => cardioDone(b, v)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => !finished && setExpanded(b.id)}
                      className="flex w-full items-center justify-between gap-2 rounded-btn bg-white px-3.5 py-3 text-left"
                      aria-label={`${b.exercise.name}${done ? ", done" : ""}. ${finished ? "" : "Open"}`}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="text-[12px] text-muted">{b.exercise.muscle_group ?? (b.cardio ? "Cardio" : "")}</span>
                        <span className="truncate text-[16px] font-bold">{b.exercise.name}</span>
                      </span>
                      {done ? (
                        <span className="flex flex-none items-center gap-1 text-[14px] font-semibold text-protein">
                          <CheckIcon size={16} /> Done
                        </span>
                      ) : (
                        <span className={cn("flex-none text-[14px] font-semibold", blockSummary(b).warn && "text-warn")}>
                          {blockSummary(b).text}
                        </span>
                      )}
                    </button>
                  )}
                </motion.div>
              )}
            </li>
          )
        })}
      </ol>

      {!finished ? (
        <>
          <button
            type="button"
            onClick={() => setPicker(true)}
            disabled={!!pending["add-block"]}
            className="ml-10 flex min-h-11 items-center justify-center gap-1.5 rounded-btn border-[1.5px] border-dashed border-dash text-[14px] font-semibold disabled:opacity-50"
          >
            + Add an exercise today
          </button>
          <p className="m-0 text-center text-[12px] text-muted">Swipe an exercise left to skip it today.</p>
        </>
      ) : null}

      <ExercisePicker
        open={picker}
        onClose={() => setPicker(false)}
        onPick={(exercise) => {
          setPicker(false)
          void call(
            "add-block",
            () => api.post<SessionResponse>(`sessions/${seg(s.id)}/blocks`, { exercise_id: exercise.id }),
            s
          ).then((ok) => {
            if (ok) toast.success(`${exercise.name} added for today`)
          })
        }}
      />

      <div
        className="fixed inset-x-0 z-30 mx-auto flex max-w-[var(--app-max)] flex-col gap-2 px-4"
        style={{ bottom: "max(26px, calc(var(--safe-bottom) + 8px))" }}
      >
        {timer.running ? (
          <RestTimerPill remaining={timer.remaining} total={timer.total} onAdd={() => timer.add(15)} onStop={timer.stop} />
        ) : null}
        <Link
          href={`/gym/session/${s.id}/review`}
          className="glass-dark flex min-h-14 items-center justify-center rounded-btn text-[16px] font-bold text-white no-underline"
        >
          {finished ? "See review" : "Finish workout"}
        </Link>
      </div>
    </main>
  )
}

function CurrentBlock({
  block,
  draftFor,
  setDraft,
  pending,
  onToggle,
  onExtra,
  onSkip,
  onCardio,
}: {
  block: SessionBlock
  draftFor: (s: SessionSet) => { kg: string; reps: string }
  setDraft: (setId: string, d: { kg: string; reps: string }) => void
  pending: Record<string, boolean>
  onToggle: (s: SessionSet) => void
  onExtra: () => void
  onSkip: () => void
  onCardio: (done: boolean) => void
}) {
  const sets = [...block.sets].sort((a, b) => a.position - b.position)
  const workCount = sets.filter((x) => !x.warmup).length
  // Working-set number for each set (warm-ups aren't counted).
  const numbers = sets.map((set, i) => sets.slice(0, i + 1).filter((x) => !x.warmup).length)
  return (
    <section aria-label={block.exercise.name} className="flex flex-col gap-3 rounded-card bg-white p-3.5">
      <div className="flex items-center gap-3">
        <div className="flex h-[72px] w-[72px] flex-none items-center justify-center overflow-hidden rounded-tile bg-mint">
          {block.exercise.gym_photo_url || block.exercise.media_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- user/exercise media from the API
            <img
              src={(block.exercise.gym_photo_url || block.exercise.media_url) as string}
              alt={block.exercise.name}
              className="h-full w-full object-cover"
            />
          ) : block.cardio ? (
            <CardioArt size={56} />
          ) : (
            <MachineArt size={56} label={block.exercise.name} />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[12px] text-muted">{block.exercise.muscle_group ?? (block.cardio ? "Cardio" : "Exercise")}</span>
          <h2 className="m-0 text-[19px] font-extrabold tracking-[-0.01em]">{block.exercise.name}</h2>
          <span className="text-[13px] text-muted">{blockPlanText(block)}</span>
        </div>
      </div>

      {block.cardio ? (
        <button
          type="button"
          aria-pressed={block.cardio_done}
          onClick={() => onCardio(!block.cardio_done)}
          className={cn(
            "flex min-h-[48px] items-center justify-center gap-2 rounded-tile text-[15px] font-bold",
            block.cardio_done ? "bg-ink text-lime" : "border border-ink"
          )}
        >
          <CheckIcon size={18} /> {block.cardio_done ? "Done" : `Mark ${cardioText(block.cardio)} done`}
        </button>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-[58px_1fr_1fr_44px] items-center gap-2 text-[12px] text-muted">
            <span>Set</span>
            <span>kg</span>
            <span>Reps</span>
            <span />
          </div>
          {sets.map((set, i) => {
            const n = numbers[i]
            const label = set.warmup ? "Warm-up" : String(n)
            const name = set.warmup ? "Warm-up" : `Set ${n}`
            const d = draftFor(set)
            const busy = !!pending[`set-${set.id}`]
            return (
              <div key={set.id} className="grid grid-cols-[58px_1fr_1fr_44px] items-center gap-2">
                <span className={cn("text-[13px]", set.warmup ? "text-muted" : "font-bold")}>{label}</span>
                <label className="block">
                  <span className="sr-only">{name} weight in kg</span>
                  <input
                    inputMode="decimal"
                    value={d.kg}
                    placeholder={set.target_kg != null ? num1(set.target_kg) : "kg"}
                    disabled={set.done}
                    onChange={(e) => setDraft(set.id, { ...d, kg: e.target.value })}
                    className={cn(
                      "box-border min-h-10 w-full min-w-0 rounded-[10px] px-2.5 font-bold",
                      set.done ? "bg-field" : "border border-line bg-white focus:border-[1.5px] focus:border-ink"
                    )}
                  />
                </label>
                <label className="block">
                  <span className="sr-only">{name} reps</span>
                  <input
                    inputMode="numeric"
                    value={d.reps}
                    placeholder={set.to_failure ? "to failure" : set.target_reps != null ? String(set.target_reps) : set.warmup ? "light" : "reps"}
                    disabled={set.done}
                    onChange={(e) => setDraft(set.id, { ...d, reps: e.target.value })}
                    className={cn(
                      "box-border min-h-10 w-full min-w-0 rounded-[10px] px-2.5",
                      set.done ? "bg-field font-bold" : "border border-line bg-white focus:border-[1.5px] focus:border-ink"
                    )}
                  />
                </label>
                <button
                  type="button"
                  aria-label={`${name} done`}
                  aria-pressed={set.done}
                  disabled={busy}
                  onClick={() => onToggle(set)}
                  className={cn(
                    "flex h-10 w-11 items-center justify-center rounded-[10px]",
                    set.done ? "bg-ink text-lime" : "border border-line bg-white text-muted"
                  )}
                >
                  {busy ? <Spinner size={16} /> : <CheckIcon size={18} />}
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {!block.cardio ? (
          <button
            type="button"
            onClick={onExtra}
            disabled={!!pending[`extra-${block.id}`]}
            className="min-h-9 rounded-full border border-dashed border-dash px-3 text-[13px] font-semibold disabled:opacity-50"
          >
            + {ordinal(workCount + 1)} set today
          </button>
        ) : (
          <span />
        )}
        <button type="button" onClick={onSkip} className="min-h-9 px-2 text-[13px] font-semibold text-muted underline">
          Skip today
        </button>
      </div>
      {!block.cardio ? <span className="-mt-1.5 text-[12px] text-muted">Rest timer starts on tick</span> : null}
    </section>
  )
}
