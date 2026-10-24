"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { Button, ErrorCard, Field, LoadingBlock, PageHeader, TextInput } from "@/components/ui/primitives"
import { ShareIcon } from "@/components/ui/icons"
import { VisibilitySelect } from "@/components/community/visibility-select"
import { ShareRoutineSheet } from "@/components/share/share-routine-sheet"
import { api, errorMessage, seg } from "@/lib/api/client"
import type { Routine, RoutineRequest, RoutineResponse, Template, TemplatesResponse, WeeklyPlan } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { cn } from "@/lib/cn"
import { WEEKDAY_KEYS, type WeekdayKey } from "@/lib/dates"
import { isOnWeek } from "./routines-section"

const DAY_NAMES: Record<WeekdayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
}

export function RoutineEditor({ id }: { id: string }) {
  const res = useApi<RoutineResponse>(`routines/${seg(id)}`)
  const templates = useApi<TemplatesResponse>("templates")

  if (res.error && !res.data) {
    return (
      <main className="app-column pb-safe flex flex-col gap-4">
        <PageHeader back="/gym" title="Routine" />
        <ErrorCard message={res.error.message} onRetry={() => void res.reload()} />
      </main>
    )
  }
  if (!res.data || !templates.data) {
    return (
      <main className="app-column">
        <LoadingBlock label="Loading routine" />
      </main>
    )
  }
  return (
    <Editor
      key={res.data.routine.updated_at}
      routine={res.data.routine}
      templates={templates.data.templates}
      onSaved={(r) => res.setData({ routine: r })}
    />
  )
}

function Editor({ routine, templates, onSaved }: { routine: Routine; templates: Template[]; onSaved: (r: Routine) => void }) {
  const router = useRouter()
  const plan = useApi<WeeklyPlan>("weekly-plan")
  const [name, setName] = useState(routine.name)
  const [description, setDescription] = useState(routine.description ?? "")
  const [days, setDays] = useState<Record<WeekdayKey, string | null>>(
    () => Object.fromEntries(WEEKDAY_KEYS.map((d) => [d, routine.days[d]?.template_id ?? null])) as Record<WeekdayKey, string | null>
  )
  const [visibility, setVisibility] = useState(routine.visibility)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [applying, setApplying] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const byId = new Map(templates.map((t) => [t.id, t]))
  const training = WEEKDAY_KEYS.filter((d) => days[d]).length

  async function save(): Promise<Routine | null> {
    const n = name.trim()
    if (!n) {
      toast.error("Give the routine a name")
      return null
    }
    setSaving(true)
    try {
      const body: RoutineRequest = { name: n, description: description.trim() || null, days }
      const out = await api.put<RoutineResponse>(`routines/${seg(routine.id)}`, body)
      setDirty(false)
      onSaved(out.routine)
      return out.routine
    } catch (err) {
      toast.error(errorMessage(err))
      return null
    } finally {
      setSaving(false)
    }
  }

  async function apply() {
    setApplying(true)
    try {
      const saved = dirty ? await save() : routine
      if (!saved) return
      const out = await api.post<{ days: WeeklyPlan["days"] }>(`routines/${seg(routine.id)}/apply`, {})
      plan.setData({ days: out.days })
      toast.success(`${saved.name} is your week now`, { action: { label: "Gym", onClick: () => router.push("/gym") } })
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setApplying(false)
    }
  }

  async function remove() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setDeleting(true)
    try {
      await api.del(`routines/${seg(routine.id)}`)
      toast.success(`${routine.name} deleted. Its workouts stay.`)
      router.push("/gym")
    } catch (err) {
      toast.error(errorMessage(err))
      setDeleting(false)
    }
  }

  const onWeek = !dirty && isOnWeek(routine, plan.data)

  return (
    <main className="app-column flex min-h-dvh flex-col gap-3">
      <PageHeader
        back="/gym"
        backLabel="Back to Gym"
        eyebrow={`Routine${routine.copied_from ? ` · from ${routine.copied_from.name}` : ""}`}
        title={
          <label className="block">
            <span className="sr-only">Routine name</span>
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
            aria-label={`Share ${routine.name} with a friend`}
            onClick={() => setShareOpen(true)}
            className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-white text-ink transition-transform duration-[160ms] ease-out active:scale-[0.97]"
          >
            <ShareIcon size={20} />
          </button>
        }
      />

      <ShareRoutineSheet routine={routine} open={shareOpen} unsaved={dirty} onClose={() => setShareOpen(false)} />

      <section aria-labelledby="routine-week" className="flex flex-col rounded-card bg-white px-3.5 pb-1 pt-1">
        <h2 id="routine-week" className="m-0 pb-1 pt-2 text-[13px] font-semibold text-muted">
          {training} training day{training === 1 ? "" : "s"}
        </h2>
        {WEEKDAY_KEYS.map((d) => {
          const fieldId = `routine-${d}`
          const value = days[d] ?? ""
          return (
            <div key={d} className="flex min-h-[52px] items-center gap-3 border-b border-line-soft last:border-b-0">
              <label htmlFor={fieldId} className="w-[92px] flex-none text-[15px]">
                {DAY_NAMES[d]}
              </label>
              <select
                id={fieldId}
                value={value}
                onChange={(e) => {
                  setDays({ ...days, [d]: e.target.value || null })
                  setDirty(true)
                }}
                className={cn(
                  "min-h-[44px] min-w-0 flex-1 rounded-[12px] border border-line bg-white px-2.5 text-[15px]",
                  value ? "font-semibold text-ink" : "text-muted"
                )}
              >
                <option value="">Rest</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
                {value && !byId.has(value) ? <option value={value}>Archived workout</option> : null}
              </select>
            </div>
          )
        })}
      </section>

      <Field label="Description" htmlFor="routine-desc" hint="What it's for, how to run it. Others see this in the Shop.">
        <TextInput
          id="routine-desc"
          value={description}
          maxLength={200}
          placeholder="Push Pull Legs, twice a week"
          onChange={(e) => {
            setDescription(e.target.value)
            setDirty(true)
          }}
        />
      </Field>

      <section aria-label="Sharing" className="rounded-card bg-white p-3.5">
        <VisibilitySelect
          value={visibility}
          onChange={setVisibility}
          path={`routines/${seg(routine.id)}/visibility`}
          hidden={routine.hidden}
          note="Its workouts are shown with it."
        />
      </section>

      {onWeek ? (
        <p className="m-0 rounded-tile bg-pink px-3.5 py-3 text-[14px] font-semibold">This is your week right now.</p>
      ) : (
        <Button variant="outline" size="md" onClick={apply} loading={applying} disabled={training === 0 || saving}>
          {dirty ? "Save and use this week" : "Use this week"}
        </Button>
      )}

      <Button variant="danger" size="md" onClick={remove} loading={deleting}>
        {confirmDelete ? "Tap again to delete this routine" : "Delete routine"}
      </Button>

      <div
        className="sticky bottom-0 -mx-4 mt-auto bg-gradient-to-t from-ground from-70% to-transparent px-4 pt-4"
        style={{ paddingBottom: "calc(var(--safe-bottom) + 20px)" }}
      >
        <Button onClick={() => void save().then((r) => r && toast.success(`Saved ${r.name}`))} loading={saving} disabled={!dirty} className="w-full">
          {dirty ? "Save routine" : "Saved"}
        </Button>
      </div>
    </main>
  )
}
