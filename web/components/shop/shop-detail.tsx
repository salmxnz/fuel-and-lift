"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { Avatar, Button, ErrorCard, LoadingBlock, PageHeader } from "@/components/ui/primitives"
import { ChevronDownIcon, ChevronUpIcon } from "@/components/ui/icons"
import { useMe } from "@/components/me-context"
import { VisibilityBadge, VisibilitySelect } from "@/components/community/visibility-select"
import { WeekStrip } from "@/components/gym/routines-section"
import { ExerciseIcon } from "@/components/gym/exercise-icon"
import { api, errorMessage, seg } from "@/lib/api/client"
import type { Routine, SavedMeal, ShopAddResponse, ShopDetailResponse, ShopKind, Template, TemplateBlock, WeeklyPlan } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { WEEKDAY_KEYS, type WeekdayKey } from "@/lib/dates"
import { kcal } from "@/lib/format"
import { addsLabel, KIND_ONE } from "./shop-card"
import { ReportSheet } from "./report-sheet"

const DAY_NAMES: Record<WeekdayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
}

const VIS_PATH: Record<ShopKind, string> = { template: "templates", meal: "saved-meals", routine: "routines" }

/** "3 × 8", "2 × 10 · 1 to failure", "5 min". */
function blockSummary(b: TemplateBlock): string {
  if (b.cardio) return `${b.cardio.minutes} min`
  const work = b.sets.filter((s) => !s.warmup)
  if (work.length === 0) return "Warm-up only"
  const reps = work.map((s) => (s.to_failure ? "F" : s.target_reps != null ? String(s.target_reps) : "?"))
  const same = reps.every((r) => r === reps[0])
  const kgs = work.map((s) => s.target_kg).filter((x): x is number => x != null)
  const weight = kgs.length > 0 ? ` @ ${Math.max(...kgs)} kg` : ""
  return (same ? `${work.length} × ${reps[0] === "F" ? "to failure" : reps[0]}` : reps.join(" / ")) + weight
}

function Blocks({ blocks }: { blocks: TemplateBlock[] }) {
  return (
    <ol className="m-0 flex list-none flex-col rounded-card bg-white px-3.5 py-1">
      {[...blocks]
        .sort((a, b) => a.position - b.position)
        .map((b) => (
          <li key={b.id} className="flex min-h-[56px] items-center gap-3 border-b border-line-soft last:border-b-0">
            <ExerciseIcon exercise={b.exercise} size={36} className="rounded-[10px]" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[15px] font-bold">{b.exercise.name || "Exercise"}</span>
              {b.notes ? <span className="truncate text-[12px] text-muted">{b.notes}</span> : null}
            </span>
            <span className="flex-none text-[13px] font-semibold text-muted">{blockSummary(b)}</span>
          </li>
        ))}
    </ol>
  )
}

function MealPreview({ meal }: { meal: SavedMeal }) {
  const base = meal.items.filter((i) => !i.is_addon)
  const addons = meal.items.filter((i) => i.is_addon)
  return (
    <>
      <div className="grid grid-cols-4 gap-2 rounded-card bg-white p-3.5 text-center">
        {(
          [
            ["kcal", kcal(meal.base.kcal)],
            ["protein", `${kcal(meal.base.protein_g)} g`],
            ["carbs", `${kcal(meal.base.carbs_g)} g`],
            ["fat", `${kcal(meal.base.fat_g)} g`],
          ] as const
        ).map(([label, v]) => (
          <span key={label} className="flex flex-col">
            <span className="text-[17px] font-extrabold tabular-nums">{v}</span>
            <span className="text-[12px] text-muted">{label}</span>
          </span>
        ))}
      </div>
      <ul className="m-0 flex list-none flex-col rounded-card bg-white px-3.5 py-1">
        {[...base, ...addons].map((it) => (
          <li key={it.id} className="flex min-h-[44px] items-center justify-between gap-3 border-b border-line-soft text-[14px] last:border-b-0">
            <span className="min-w-0 truncate">
              {it.name}
              {it.grams != null ? <span className="text-muted"> · {kcal(it.grams)} g</span> : null}
              {it.is_addon ? <span className="text-muted"> · add-on</span> : null}
            </span>
            <span className="flex-none font-semibold tabular-nums">{kcal(it.kcal)} kcal</span>
          </li>
        ))}
      </ul>
    </>
  )
}

function RoutinePreview({ routine }: { routine: Routine }) {
  const byId = new Map((routine.templates ?? []).map((t) => [t.id, t]))
  const [open, setOpen] = useState<string | null>(null)
  return (
    <>
      <div className="rounded-card bg-white p-3.5">
        <WeekStrip days={routine.days} />
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {WEEKDAY_KEYS.filter((d) => routine.days[d]).map((d) => {
          const day = routine.days[d]!
          const t: Template | undefined = byId.get(day.template_id)
          const key = `${d}-${day.template_id}`
          const expanded = open === key
          return (
            <li key={key} className="flex flex-col gap-2">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : key)}
                className="flex min-h-[56px] items-center justify-between gap-3 rounded-card bg-white px-3.5 text-left"
              >
                <span className="flex flex-col">
                  <span className="text-[12px] font-semibold text-muted">{DAY_NAMES[d]}</span>
                  <span className="text-[15px] font-bold">{day.name}</span>
                </span>
                <span className="flex items-center gap-2 text-[13px] text-muted">
                  {t ? `${t.blocks.length} exercise${t.blocks.length === 1 ? "" : "s"}` : null}
                  {expanded ? <ChevronUpIcon size={18} /> : <ChevronDownIcon size={18} />}
                </span>
              </button>
              {expanded && t ? <Blocks blocks={t.blocks} /> : null}
            </li>
          )
        })}
      </ul>
    </>
  )
}

export function ShopDetail({ kind, id }: { kind: ShopKind; id: string }) {
  const res = useApi<ShopDetailResponse>(`shop/${seg(kind)}/${seg(id)}`)
  if (res.error && !res.data) {
    return (
      <main className="app-column pb-safe flex flex-col gap-4">
        <PageHeader back="history" title="Shop" />
        <ErrorCard
          message={res.error.status === 404 ? "This isn't shared with you, or it was removed." : res.error.message}
          onRetry={res.error.status === 404 ? undefined : () => void res.reload()}
        />
      </main>
    )
  }
  if (!res.data) {
    return (
      <main className="app-column">
        <LoadingBlock label="Loading" />
      </main>
    )
  }
  return <Detail kind={kind} data={res.data} onChange={(d) => res.setData(d)} />
}

function Detail({ kind, data, onChange }: { kind: ShopKind; data: ShopDetailResponse; onChange: (d: ShopDetailResponse) => void }) {
  const router = useRouter()
  const me = useMe()
  const admin = me.user.role === "admin"
  const { item } = data
  const [busy, setBusy] = useState<"add" | "apply" | "hide" | null>(null)
  const [added, setAdded] = useState<ShopAddResponse | null>(null)
  const [reportOpen, setReportOpen] = useState(false)
  const description = data.routine?.description ?? null

  function openAdded(out: ShopAddResponse) {
    if (out.template) router.push(`/gym/templates/${out.template.id}`)
    else if (out.routine) router.push(`/gym/routines/${out.routine.id}`)
    else router.push("/saved-meals")
  }

  async function add() {
    setBusy("add")
    try {
      const out = await api.post<ShopAddResponse>(`shop/${seg(kind)}/${seg(item.id)}/add`, {})
      setAdded(out)
      onChange({ ...data, item: { ...item, added: true, add_count: item.added ? item.add_count : item.add_count + 1 } })
      const where = kind === "meal" ? "your saved meals" : kind === "routine" ? "your routines" : "your workouts"
      toast.success(`Added to ${where}`, { action: { label: "Open", onClick: () => openAdded(out) } })
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function useThisWeek() {
    if (!added?.routine) return
    setBusy("apply")
    try {
      await api.post<{ days: WeeklyPlan["days"] }>(`routines/${seg(added.routine.id)}/apply`, {})
      toast.success(`${added.routine.name} is your week now`, { action: { label: "Gym", onClick: () => router.push("/gym") } })
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function setHidden(hidden: boolean) {
    setBusy("hide")
    try {
      if (hidden) await api.post(`admin/shop/${seg(kind)}/${seg(item.id)}/hide`, {})
      else await api.del(`admin/shop/${seg(kind)}/${seg(item.id)}/hide`)
      onChange({ ...data, item: { ...item, hidden } })
      toast.success(hidden ? "Hidden from the Shop" : "Back in the Shop")
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const editHref =
    kind === "template" ? `/gym/templates/${item.id}` : kind === "routine" ? `/gym/routines/${item.id}` : "/saved-meals"

  return (
    <main className="app-column pb-safe flex min-h-dvh flex-col gap-3.5">
      <PageHeader back="history" eyebrow={KIND_ONE[kind]} title={item.name} />

      <div className="flex items-center gap-2.5">
        <Link href={`/people/${item.creator.id}`} className="flex min-h-[44px] min-w-0 items-center gap-2.5 no-underline">
          <Avatar name={item.creator.name} url={item.creator.avatar_url} size={36} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[15px] font-bold">{item.mine ? "You" : item.creator.name}</span>
            <span className="text-[12px] text-muted">{addsLabel(item.add_count)}</span>
          </span>
        </Link>
        <span className="ml-auto">
          <VisibilityBadge visibility={item.visibility} hidden={item.hidden} />
        </span>
      </div>

      {description ? <p className="m-0 text-[15px] leading-[1.45]">{description}</p> : null}

      {data.template ? (
        data.template.blocks.length > 0 ? (
          <Blocks blocks={data.template.blocks} />
        ) : (
          <p className="m-0 rounded-card bg-white p-4 text-[15px] text-muted">No exercises yet.</p>
        )
      ) : null}
      {data.saved_meal ? <MealPreview meal={data.saved_meal} /> : null}
      {data.routine ? <RoutinePreview routine={data.routine} /> : null}

      {item.mine ? (
        <section aria-label="Yours" className="flex flex-col gap-3 rounded-card bg-white p-3.5">
          <VisibilitySelect
            value={item.visibility}
            onChange={(v) => onChange({ ...data, item: { ...item, visibility: v } })}
            path={`${VIS_PATH[kind]}/${seg(item.id)}/visibility`}
            hidden={item.hidden}
            note={kind === "routine" ? "Its workouts are shown with it." : undefined}
          />
          <Link href={editHref} className="text-[14px] font-semibold text-protein no-underline">
            Edit it
          </Link>
        </section>
      ) : (
        <div className="mt-auto flex flex-col gap-2 pt-2">
          {added?.routine ? (
            <Button variant="pink" onClick={useThisWeek} loading={busy === "apply"}>
              Use it this week
            </Button>
          ) : null}
          {added ? (
            <Button variant="outline" onClick={() => openAdded(added)}>
              Open my copy
            </Button>
          ) : (
            <Button onClick={add} loading={busy === "add"} disabled={item.hidden && !admin}>
              {item.added ? "Add another copy" : "Add to mine"}
            </Button>
          )}
          <Button variant="ghost" size="md" className="text-muted" onClick={() => setReportOpen(true)}>
            Report
          </Button>
        </div>
      )}

      {admin ? (
        <Button variant="danger" size="md" loading={busy === "hide"} onClick={() => void setHidden(!item.hidden)}>
          {item.hidden ? "Show in the Shop again" : "Hide from the Shop"}
        </Button>
      ) : null}

      <ReportSheet kind={kind} id={item.id} name={item.name} open={reportOpen} onClose={() => setReportOpen(false)} />
    </main>
  )
}
