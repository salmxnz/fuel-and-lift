"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from "motion/react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button, ErrorCard, Spinner, Switch } from "@/components/ui/primitives"
import { CardioArt, CheckIcon, CloseIcon, MachineArt, PencilIcon, TrendIcon } from "@/components/ui/icons"
import { Sheet } from "@/components/ui/sheet"
import { api, errorMessage, seg } from "@/lib/api/client"
import type {
  FinishSessionResponse,
  Proposal,
  Session,
  SessionBlock,
  SessionResponse,
  TemplateResponse,
} from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { cn } from "@/lib/cn"
import { num1, parseDecimal, signed } from "@/lib/format"
import { cardioText, doneText, plannedText } from "./session-helpers"

const THRESHOLD = 100
type Dir = "right" | "left" | "up"

function useNightBody() {
  useEffect(() => {
    document.body.classList.add("theme-night")
    const meta = document.querySelector('meta[name="theme-color"]')
    const prev = meta?.getAttribute("content")
    meta?.setAttribute("content", "#171A12")
    return () => {
      document.body.classList.remove("theme-night")
      if (meta && prev) meta.setAttribute("content", prev)
    }
  }, [])
}

export function ReviewScreen({ id }: { id: string }) {
  useNightBody()
  const router = useRouter()
  const res = useApi<SessionResponse>(`sessions/${seg(id)}`)
  const session = res.data?.session
  const [idx, setIdx] = useState(0)
  const [exitDir, setExitDir] = useState<Dir>("right")
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<SessionBlock | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [proposals, setProposals] = useState<Proposal[] | null>(null)
  const [finishedSession, setFinishedSession] = useState<Session | null>(null)

  if (res.error && !session) {
    return (
      <main className="on-dark app-column pb-safe flex min-h-dvh flex-col gap-4 bg-night text-white">
        <ErrorCard dark message={res.error.message} onRetry={() => void res.reload()} />
      </main>
    )
  }
  if (!session) {
    return (
      <main className="on-dark app-column flex min-h-dvh items-center justify-center bg-night text-white" role="status">
        <Spinner size={28} />
        <span className="sr-only">Loading review…</span>
      </main>
    )
  }

  const s = session
  const reviewable = [...s.blocks].sort((a, b) => a.position - b.position)
  const total = reviewable.length
  const current = reviewable[idx] ?? null
  const name = s.template_name ?? "Workout"

  async function finish(after?: Session) {
    setFinishing(true)
    try {
      const out = await api.post<FinishSessionResponse>(`sessions/${seg(s.id)}/finish`)
      setFinishedSession(out.session)
      res.setData({ session: out.session })
      for (const r of out.records ?? []) {
        toast.success(`New record: ${r.exercise_name} ${num1(r.kg)} kg × ${r.reps}`)
      }
      if (out.proposals.length > 0) setProposals(out.proposals)
      else {
        toast.success(`${name} saved`)
        router.push("/gym")
      }
    } catch (err) {
      toast.error(errorMessage(err))
      if (after) res.setData({ session: after })
    } finally {
      setFinishing(false)
    }
  }

  function advance(dir: Dir) {
    setExitDir(dir)
    setIdx((i) => i + 1)
  }

  async function markDone(block: SessionBlock) {
    setBusy(true)
    try {
      let latest: Session = s
      if (block.cardio) {
        if (!block.cardio_done) {
          latest = (await api.patch<SessionResponse>(`sessions/${seg(s.id)}/blocks/${seg(block.id)}`, { cardio_done: true })).session
        }
      } else {
        for (const set of block.sets.filter((x) => !x.done)) {
          latest = (
            await api.patch<SessionResponse>(`sessions/${seg(s.id)}/sets/${seg(set.id)}`, {
              done: true,
              actual_kg: set.actual_kg ?? set.target_kg,
              actual_reps: set.actual_reps ?? set.target_reps,
            })
          ).session
        }
      }
      if (block.skipped) {
        latest = (await api.patch<SessionResponse>(`sessions/${seg(s.id)}/blocks/${seg(block.id)}`, { skipped: false })).session
      }
      res.setData({ session: latest })
      advance("right")
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function markSkipped(block: SessionBlock) {
    setBusy(true)
    try {
      if (!block.skipped) {
        const out = await api.patch<SessionResponse>(`sessions/${seg(s.id)}/blocks/${seg(block.id)}`, { skipped: true })
        res.setData({ session: out.session })
      }
      advance("up")
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function acceptAll() {
    setBusy(true)
    try {
      const out = await api.post<SessionResponse>(`sessions/${seg(s.id)}/accept-all`)
      res.setData({ session: out.session })
      setIdx(total)
      await finish(out.session)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const alreadyFinished = s.status === "finished" && !finishedSession
  const reviewedAll = idx >= total

  return (
    <main
      className="on-dark app-column flex min-h-dvh flex-col gap-4 overflow-x-hidden bg-night text-white"
      style={{ paddingBottom: "calc(var(--safe-bottom) + 24px)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] text-night-muted">
            {alreadyFinished ? `${name} finished` : `${name} done, ${Math.min(idx + 1, total)} of ${total}`}
          </span>
          <h1 className="m-0 text-[26px] font-extrabold tracking-[-0.02em]">Quick review</h1>
        </div>
        {!alreadyFinished && !reviewedAll ? (
          <Button variant="night-outline" size="sm" onClick={acceptAll} disabled={busy || finishing}>
            Accept all
          </Button>
        ) : (
          <Link
            href={`/gym/session/${s.id}`}
            className="flex min-h-11 items-center rounded-[12px] border border-night-line px-3.5 text-[14px] font-bold text-white no-underline"
          >
            Back
          </Link>
        )}
      </div>

      {total > 0 ? (
        <div
          role="progressbar"
          aria-label="Review progress"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={Math.min(idx, total)}
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
        >
          {reviewable.map((b, i) => (
            <span key={b.id} className={cn("h-1 rounded-sm", i < idx ? "bg-lime" : i === idx ? "bg-white" : "bg-night-3")} />
          ))}
        </div>
      ) : null}

      {alreadyFinished ? (
        <FinishedSummary session={s} />
      ) : reviewedAll ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-lime text-ink">
            <CheckIcon size={30} />
          </span>
          <p className="m-0 text-[18px] font-bold">All checked</p>
          <Button variant="lime" onClick={() => finish()} loading={finishing} className="w-full">
            Save workout
          </Button>
          <button type="button" onClick={() => setIdx(0)} className="min-h-11 text-[14px] text-night-muted underline">
            Review again
          </button>
        </div>
      ) : current ? (
        <>
          <div className="relative mt-2 min-h-[440px] flex-1">
            <span aria-hidden="true" className="absolute inset-x-7 bottom-0 top-7 rounded-sheet bg-night-3" />
            <span aria-hidden="true" className="absolute inset-3.5 rounded-sheet bg-night-dim" />
            <AnimatePresence initial={false} custom={exitDir}>
              <SwipeCard
                key={current.id}
                block={current}
                templateName={name}
                disabled={busy}
                exitDir={exitDir}
                onSwipe={(dir) => {
                  if (dir === "right") void markDone(current)
                  else if (dir === "up") void markSkipped(current)
                  else setEditing(current)
                }}
              />
            </AnimatePresence>
          </div>

          <div className="grid grid-cols-3 items-end gap-2">
            <ActionButton label="Edit" onClick={() => setEditing(current)} disabled={busy}>
              <PencilIcon size={22} />
            </ActionButton>
            <ActionButton label="Skipped" onClick={() => markSkipped(current)} disabled={busy}>
              <CloseIcon size={22} strokeWidth={2} />
            </ActionButton>
            <button
              type="button"
              onClick={() => markDone(current)}
              disabled={busy}
              className="flex flex-col items-center gap-1.5 text-[13px] font-bold text-white disabled:opacity-60"
            >
              <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-lime text-ink">
                {busy ? <Spinner size={24} /> : <CheckIcon size={28} />}
              </span>
              Done
            </button>
          </div>
          <p className="m-0 text-center text-[12px] text-night-muted">Swipe left to edit, up to skip, right when it is right</p>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="m-0 text-[16px] text-night-soft">Nothing to review in this workout.</p>
          <Button variant="lime" onClick={() => finish()} loading={finishing} className="w-full">
            Finish anyway
          </Button>
        </div>
      )}

      <EditSheet
        block={editing}
        session={s}
        onClose={() => setEditing(null)}
        onSaved={(next) => {
          res.setData({ session: next })
          setEditing(null)
          advance("left")
        }}
      />

      <UpdateTemplateSheet
        open={!!proposals}
        proposals={proposals ?? []}
        session={finishedSession ?? s}
        onDone={() => router.push("/gym")}
      />
    </main>
  )
}

function ActionButton({
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
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1.5 text-[13px] font-semibold text-white disabled:opacity-60"
    >
      <span className="flex h-[58px] w-[58px] items-center justify-center rounded-full border-[1.5px] border-night-line">{children}</span>
      {label}
    </button>
  )
}

function topKg(block: SessionBlock, which: "target" | "actual"): number | null {
  const work = block.sets.filter((s) => !s.warmup && (which === "target" || s.done))
  const vals = work.map((s) => (which === "target" ? s.target_kg : (s.actual_kg ?? s.target_kg))).filter((v): v is number => v != null)
  return vals.length ? Math.max(...vals) : null
}

function SwipeCard({
  block,
  templateName,
  disabled,
  exitDir,
  onSwipe,
}: {
  block: SessionBlock
  templateName: string
  disabled: boolean
  exitDir: Dir
  onSwipe: (dir: Dir) => void
}) {
  const reduce = useReducedMotion()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotate = useTransform(x, [-200, 0, 200], [-12, -2.5, 8])
  const doneOpacity = useTransform(x, [0, THRESHOLD], [0.35, 1])
  const editOpacity = useTransform(x, [-THRESHOLD, 0], [1, 0])
  const skipOpacity = useTransform(y, [-THRESHOLD, 0], [1, 0])

  const target = topKg(block, "target")
  const actual = topKg(block, "actual")
  const diff = target != null && actual != null ? actual - target : null
  const badge =
    block.cardio != null
      ? cardioText(block.cardio)
      : diff == null
        ? "Planned"
        : Math.abs(diff) < 0.01
          ? "As planned"
          : `${signed(diff, 1)} kg vs ${templateName}`
  const sets = [...block.sets].sort((a, b) => a.position - b.position)
  const numbers = sets.map((set, i) => sets.slice(0, i + 1).filter((z) => !z.warmup).length)

  function onDragEnd(_: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) {
    if (disabled) return
    const { x: ox, y: oy } = info.offset
    if (oy < -THRESHOLD && Math.abs(oy) > Math.abs(ox)) onSwipe("up")
    else if (ox > THRESHOLD) onSwipe("right")
    else if (ox < -THRESHOLD) onSwipe("left")
  }

  const exit = reduce
    ? { opacity: 0 }
    : exitDir === "right"
      ? { x: 420, rotate: 16, opacity: 0 }
      : exitDir === "left"
        ? { x: -420, rotate: -16, opacity: 0 }
        : { y: -620, opacity: 0 }

  return (
    <motion.article
      aria-label={block.exercise.name}
      className="absolute inset-x-0 bottom-7 top-0 box-border flex cursor-grab touch-none flex-col gap-4 rounded-sheet bg-white p-[18px] text-ink shadow-[0_18px_40px_rgba(0,0,0,0.35)] active:cursor-grabbing"
      style={{ x, y, rotate: reduce ? 0 : rotate, transformOrigin: "50% 100%" }}
      drag={disabled ? false : true}
      dragSnapToOrigin
      dragElastic={0.9}
      onDragEnd={onDragEnd}
      initial={reduce ? { opacity: 0 } : { scale: 0.94, opacity: 0, y: 14 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={exit}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
    >
      <div className="flex items-start justify-between">
        <span className={cn("rounded-full px-2.5 py-1.5 text-[13px] font-bold", diff != null && diff > 0 ? "bg-lime" : "bg-mint")}>
          {badge}
        </span>
        <motion.span
          aria-hidden="true"
          style={{ opacity: doneOpacity }}
          className="rotate-[8deg] rounded-lg border-2 border-protein px-2 py-1 text-[13px] font-extrabold text-protein"
        >
          Done
        </motion.span>
      </div>
      <motion.span
        aria-hidden="true"
        style={{ opacity: editOpacity }}
        className="pointer-events-none absolute right-5 top-16 -rotate-[8deg] rounded-lg border-2 border-ink px-2 py-1 text-[13px] font-extrabold"
      >
        Edit
      </motion.span>
      <motion.span
        aria-hidden="true"
        style={{ opacity: skipOpacity }}
        className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 rounded-lg border-2 border-warn px-2 py-1 text-[13px] font-extrabold text-warn"
      >
        Skipped
      </motion.span>

      <div className="flex h-[150px] flex-none items-center justify-center overflow-hidden rounded-card bg-mint">
        {block.exercise.gym_photo_url || block.exercise.media_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- exercise media from the API
          <img
            src={(block.exercise.gym_photo_url || block.exercise.media_url) as string}
            alt=""
            draggable={false}
            className="h-full w-full object-cover"
          />
        ) : block.cardio ? (
          <CardioArt size={110} />
        ) : (
          <MachineArt size={120} label={block.exercise.name} />
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] text-muted">{block.exercise.muscle_group ?? (block.cardio ? "Cardio" : "Exercise")}</span>
        <h2 className="m-0 text-[28px] font-extrabold leading-tight tracking-[-0.02em]">{block.exercise.name}</h2>
      </div>
      {block.cardio ? (
        <p className="m-0 text-[15px]">
          {block.cardio_done ? "Done: " : "Planned: "}
          {cardioText(block.cardio)}
        </p>
      ) : (
        <div className="min-h-0 overflow-y-auto">
          <table className="w-full border-collapse text-[15px]">
            <thead>
              <tr>
                <th scope="col" className="pb-1.5 text-left text-[12px] font-medium text-muted">Set</th>
                <th scope="col" className="pb-1.5 text-left text-[12px] font-medium text-muted">Planned</th>
                <th scope="col" className="pb-1.5 text-left text-[12px] font-medium text-muted">Done</th>
              </tr>
            </thead>
            <tbody>
              {sets.map((set, i) => (
                <tr key={set.id} className="border-t border-line-soft">
                  <td className={cn("py-2", set.warmup ? "text-muted" : "font-bold")}>{set.warmup ? "Warm-up" : numbers[i]}</td>
                  <td className="py-2">{plannedText(set)}</td>
                  <td className={cn("py-2", !set.warmup && "font-bold", !set.done && "font-normal text-muted")}>{doneText(set)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.article>
  )
}

function EditSheet({
  block,
  session,
  onClose,
  onSaved,
}: {
  block: SessionBlock | null
  session: Session
  onClose: () => void
  onSaved: (s: Session) => void
}) {
  return (
    <Sheet open={!!block} onClose={onClose} title={block ? `Edit ${block.exercise.name}` : "Edit"} surface="ground">
      {block ? <EditForm key={block.id} block={block} session={session} onSaved={onSaved} /> : null}
    </Sheet>
  )
}

function EditForm({ block, session, onSaved }: { block: SessionBlock; session: Session; onSaved: (s: Session) => void }) {
  const sets = [...block.sets].sort((a, b) => a.position - b.position)
  const numbers = sets.map((set, i) => sets.slice(0, i + 1).filter((z) => !z.warmup).length)
  const [rows, setRows] = useState(() =>
    sets.map((set) => ({
      id: set.id,
      done: set.done,
      kg: set.actual_kg != null ? String(set.actual_kg) : set.target_kg != null ? String(set.target_kg) : "",
      reps: set.actual_reps != null ? String(set.actual_reps) : set.target_reps != null ? String(set.target_reps) : "",
    }))
  )
  const [cardioDone, setCardioDone] = useState(block.cardio_done)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      let latest = session
      if (block.cardio) {
        latest = (await api.patch<SessionResponse>(`sessions/${seg(session.id)}/blocks/${seg(block.id)}`, { cardio_done: cardioDone })).session
      } else {
        for (const r of rows) {
          const orig = sets.find((x) => x.id === r.id)
          if (!orig) continue
          const kg = parseDecimal(r.kg)
          const reps = parseDecimal(r.reps)
          const changed = orig.done !== r.done || (r.done && (kg !== orig.actual_kg || reps !== orig.actual_reps))
          if (!changed) continue
          latest = (
            await api.patch<SessionResponse>(`sessions/${seg(session.id)}/sets/${seg(r.id)}`, {
              done: r.done,
              ...(r.done ? { actual_kg: kg, actual_reps: reps != null ? Math.round(reps) : null } : {}),
            })
          ).session
        }
      }
      if (block.skipped) {
        latest = (await api.patch<SessionResponse>(`sessions/${seg(session.id)}/blocks/${seg(block.id)}`, { skipped: false })).session
      }
      onSaved(latest)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {block.cardio ? (
        <div className="flex min-h-14 items-center justify-between rounded-tile bg-white px-3.5">
          <span id="cardio-done-label" className="text-[15px] font-semibold">
            Did {cardioText(block.cardio)}
          </span>
          <Switch checked={cardioDone} onChange={setCardioDone} labelledBy="cardio-done-label" />
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 rounded-card bg-white p-3.5">
          <div className="grid grid-cols-[64px_1fr_1fr_52px] items-center gap-2 text-[12px] text-muted">
            <span>Set</span>
            <span>kg</span>
            <span>Reps</span>
            <span>Done</span>
          </div>
          {rows.map((r, i) => {
            const set = sets[i]
            const label = set.warmup ? "Warm-up" : `Set ${numbers[i]}`
            return (
              <div key={r.id} className="grid grid-cols-[64px_1fr_1fr_52px] items-center gap-2">
                <span className={cn("text-[13px]", set.warmup ? "text-muted" : "font-bold")}>{set.warmup ? "Warm-up" : numbers[i]}</span>
                <input
                  inputMode="decimal"
                  aria-label={`${label} kg`}
                  value={r.kg}
                  onChange={(e) => setRows((all) => all.map((x) => (x.id === r.id ? { ...x, kg: e.target.value } : x)))}
                  className="min-h-10 w-full min-w-0 rounded-[10px] border border-line px-2.5 font-bold"
                />
                <input
                  inputMode="numeric"
                  aria-label={`${label} reps`}
                  value={r.reps}
                  placeholder={set.to_failure ? "reps" : undefined}
                  onChange={(e) => setRows((all) => all.map((x) => (x.id === r.id ? { ...x, reps: e.target.value } : x)))}
                  className="min-h-10 w-full min-w-0 rounded-[10px] border border-line px-2.5"
                />
                <input
                  type="checkbox"
                  aria-label={`${label} done`}
                  checked={r.done}
                  onChange={(e) => setRows((all) => all.map((x) => (x.id === r.id ? { ...x, done: e.target.checked } : x)))}
                  className="h-6 w-6 justify-self-center accent-ink"
                />
              </div>
            )
          })}
        </div>
      )}
      <Button onClick={save} loading={saving}>
        Save and next
      </Button>
    </div>
  )
}

function UpdateTemplateSheet({
  open,
  proposals,
  session,
  onDone,
}: {
  open: boolean
  proposals: Proposal[]
  session: Session
  onDone: () => void
}) {
  const name = session.template_name ?? "your template"
  const version = session.template_version ?? 1
  const [off, setOff] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const chosen = proposals.filter((p) => !off.includes(p.exercise_id)).map((p) => p.exercise_id)

  async function apply() {
    if (chosen.length === 0) return onDone()
    setSaving(true)
    try {
      const out = await api.post<TemplateResponse>(`sessions/${seg(session.id)}/apply`, { exercise_ids: chosen })
      toast.success(`Saved as ${out.template.name} v${out.template.version}`)
      onDone()
    } catch (err) {
      toast.error(errorMessage(err))
      setSaving(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onDone}
      surface="ground"
      title={`Update ${name}?`}
      description="You lifted more than planned on every working set. Pick what next time should start from."
      showClose={false}
    >
      <div className="flex flex-col rounded-card bg-white px-3.5 py-1">
        {proposals.map((p) => {
          const id = `chg-${p.exercise_id}`
          return (
            <div key={p.exercise_id} className="flex items-center gap-3 border-b border-line-soft py-3 last:border-b-0">
              <div className="flex flex-1 flex-col gap-1">
                <span id={id} className="text-[16px] font-bold">
                  {p.exercise_name}
                </span>
                <span className="text-[14px]">
                  <span className="text-muted line-through">{num1(p.from_kg)} kg</span> <span aria-hidden="true">→</span>{" "}
                  <span className="sr-only">to</span>
                  <span className="rounded-md bg-lime px-1.5 py-px font-bold">{num1(p.to_kg)} kg</span>
                </span>
              </div>
              <Switch
                checked={!off.includes(p.exercise_id)}
                onChange={(v) => setOff((o) => (v ? o.filter((x) => x !== p.exercise_id) : [...o, p.exercise_id]))}
                labelledBy={id}
              />
            </div>
          )
        })}
      </div>
      <div className="flex items-start gap-2.5 rounded-tile border-[1.5px] border-dashed border-dash px-3.5 py-3">
        <TrendIcon size={20} className="mt-px flex-none text-protein" />
        <span className="text-[13px] leading-[1.45]">
          {name} v{version} stays in your history, so the progress chart shows the jump.
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <Button onClick={apply} loading={saving} disabled={chosen.length === 0}>
          Save as {name} v{version + 1}
        </Button>
        <Button variant="ghost" size="md" onClick={onDone} disabled={saving}>
          Keep {name} as it is
        </Button>
      </div>
    </Sheet>
  )
}

function FinishedSummary({ session }: { session: Session }) {
  const blocks = [...session.blocks].sort((a, b) => a.position - b.position)
  return (
    <div className="flex flex-1 flex-col gap-3">
      <ul className="m-0 flex list-none flex-col rounded-card border border-night-3 px-3.5 py-1">
        {blocks.map((b) => (
          <li key={b.id} className="flex min-h-12 items-center justify-between gap-3 border-b border-night-3 text-[14px] last:border-b-0">
            <span className={cn("font-semibold", b.skipped && "text-night-dim line-through")}>{b.exercise.name}</span>
            <span className="text-night-muted">
              {b.skipped ? "Skipped" : b.cardio ? cardioText(b.cardio) : `${b.sets.filter((x) => x.done && !x.warmup).length} sets`}
            </span>
          </li>
        ))}
      </ul>
      <Link
        href="/gym"
        className="mt-auto flex min-h-14 items-center justify-center rounded-btn bg-lime text-[16px] font-bold text-ink no-underline"
      >
        Back to Gym
      </Link>
    </div>
  )
}
