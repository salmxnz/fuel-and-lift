"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { Button, Field, Skeleton, TextInput } from "@/components/ui/primitives"
import { PlusIcon } from "@/components/ui/icons"
import { Sheet } from "@/components/ui/sheet"
import { VisibilityBadge } from "@/components/community/visibility-select"
import { api, errorMessage, seg } from "@/lib/api/client"
import type { ApplySplitResponse, Routine, RoutineResponse, RoutinesResponse, WeeklyPlan } from "@/lib/api/types"
import type { ApiState } from "@/lib/api/use-api"
import { cn } from "@/lib/cn"
import { WEEKDAY_KEYS } from "@/lib/dates"
import { SplitSheet } from "./split-sheet"

const LETTER = { mon: "M", tue: "T", wed: "W", thu: "T", fri: "F", sat: "S", sun: "S" } as const

/** The routine's week matches the weekly plan exactly. */
export function isOnWeek(r: Routine, plan: WeeklyPlan | null | undefined): boolean {
  if (!plan) return false
  return WEEKDAY_KEYS.every((d) => (r.days[d]?.template_id ?? null) === (plan.days[d] ?? null))
}

/** A 7-day strip: each training day shows the workout's initial. */
export function WeekStrip({ days }: { days: Record<string, { name: string } | string | null | undefined> }) {
  return (
    <span className="grid grid-cols-7 gap-1" aria-hidden="true">
      {WEEKDAY_KEYS.map((d) => {
        const v = days[d]
        const name = typeof v === "string" ? v : v?.name
        return (
          <span key={d} className="flex flex-col items-center gap-0.5">
            <span className="text-[10px] font-semibold text-muted">{LETTER[d]}</span>
            <span
              className={cn(
                "flex h-7 w-full items-center justify-center rounded-[8px] text-[11px] font-bold",
                name ? "bg-ink text-pink" : "bg-chip text-muted"
              )}
            >
              {name ? name.slice(0, 2) : "·"}
            </span>
          </span>
        )
      })}
    </span>
  )
}

export function RoutinesSection({
  routines,
  plan,
  onPlanChange,
  onTemplatesChanged,
}: {
  routines: ApiState<RoutinesResponse>
  plan: WeeklyPlan | null
  onPlanChange: (days: WeeklyPlan["days"]) => void
  onTemplatesChanged: () => void
}) {
  const [splitOpen, setSplitOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [confirm, setConfirm] = useState<Routine | null>(null)
  const [applying, setApplying] = useState<string | null>(null)
  const list = routines.data?.routines ?? []
  const weekHasWorkouts = !!plan && WEEKDAY_KEYS.some((d) => plan.days[d])

  async function apply(r: Routine) {
    setConfirm(null)
    setApplying(r.id)
    try {
      const res = await api.post<{ days: WeeklyPlan["days"] }>(`routines/${seg(r.id)}/apply`, {})
      onPlanChange(res.days)
      toast.success(`${r.name} is your week now`)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setApplying(null)
    }
  }

  return (
    <>
      <div className="-mb-1 mt-1 flex items-center justify-between gap-2">
        <h2 className="m-0 text-[17px] font-extrabold">Routines</h2>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setSplitOpen(true)}
            className="flex min-h-[36px] items-center gap-1.5 rounded-full bg-white px-3 text-[13px] font-semibold"
          >
            From a split
          </button>
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className="flex min-h-[36px] items-center gap-1.5 rounded-full border-[1.5px] border-dashed border-dash px-3 text-[13px] font-semibold"
          >
            <PlusIcon size={16} /> New
          </button>
        </div>
      </div>

      {routines.loading ? (
        <Skeleton className="h-[96px] rounded-card" />
      ) : list.length === 0 ? (
        <div className="rounded-card border-[1.5px] border-dashed border-dash p-4 text-[15px] text-muted">
          A routine is a week of workouts, like Push Pull Legs. Start from a split, or save your own week and share it.
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {list.map((r) => {
            const onWeek = isOnWeek(r, plan)
            return (
              <li key={r.id} className="flex flex-col gap-2.5 rounded-card bg-white p-3.5">
                <Link href={`/gym/routines/${r.id}`} className="flex min-w-0 flex-col gap-2 no-underline">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[16px] font-bold">{r.name}</span>
                    <VisibilityBadge visibility={r.visibility} hidden={r.hidden} />
                    {onWeek ? <span className="rounded-full bg-pink px-2 py-0.5 text-[11px] font-bold">On your week</span> : null}
                  </span>
                  <WeekStrip days={r.days} />
                </Link>
                {!onWeek ? (
                  <Button
                    size="sm"
                    variant="outline"
                    loading={applying === r.id}
                    disabled={applying !== null || WEEKDAY_KEYS.every((d) => !r.days[d])}
                    onClick={() => (weekHasWorkouts ? setConfirm(r) : void apply(r))}
                  >
                    Use this week
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      <Sheet
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm ? `Use ${confirm.name}?` : "Use routine"}
        description="Its workouts replace the ones on your week. Your workouts and history stay."
      >
        <Button onClick={() => confirm && void apply(confirm)}>Replace my week</Button>
        <Button variant="ghost" size="md" onClick={() => setConfirm(null)}>
          Keep my week
        </Button>
      </Sheet>

      <SplitSheet
        open={splitOpen}
        onClose={() => setSplitOpen(false)}
        onApplied={(res: ApplySplitResponse) => {
          setSplitOpen(false)
          routines.setData((prev) => ({ routines: [res.routine, ...(prev?.routines ?? [])] }))
          onPlanChange(res.days)
          onTemplatesChanged()
        }}
      />
      <NewRoutineSheet open={newOpen} onClose={() => setNewOpen(false)} plan={plan} />
    </>
  )
}

function NewRoutineSheet({ open, onClose, plan }: { open: boolean; onClose: () => void; plan: WeeklyPlan | null }) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const empty = Object.fromEntries(WEEKDAY_KEYS.map((d) => [d, null])) as WeeklyPlan["days"]
  return (
    <Sheet open={open} onClose={onClose} title="New routine" description="It starts as your current week. Pick a workout for each day next.">
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault()
          const n = name.trim()
          if (!n) return
          setBusy(true)
          try {
            const res = await api.post<RoutineResponse>("routines", { name: n, days: plan?.days ?? empty })
            router.push(`/gym/routines/${res.routine.id}`)
          } catch (err) {
            toast.error(errorMessage(err))
            setBusy(false)
          }
        }}
      >
        <Field label="Name" htmlFor="routine-name">
          <TextInput id="routine-name" data-autofocus value={name} maxLength={40} placeholder="My PPL" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button type="submit" loading={busy} disabled={!name.trim()}>
          Create routine
        </Button>
      </form>
    </Sheet>
  )
}
