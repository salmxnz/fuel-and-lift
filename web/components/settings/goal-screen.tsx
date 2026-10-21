"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { useMe } from "@/components/me-context"
import { goalSentence } from "@/components/me/me-screen"
import { PacePicker } from "@/components/onboarding/pace-picker"
import { Button, Chip, ErrorCard, Field, PageHeader, Skeleton, TextInput } from "@/components/ui/primitives"
import { api, errorMessage } from "@/lib/api/client"
import type { GoalResponse, Mode, Pace, PlanPreviewRequest, WeighInsResponse } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { formatDayMonth, formatMonthYear } from "@/lib/dates"
import { kcal, num1, parseDecimal } from "@/lib/format"

export function GoalScreen() {
  const me = useMe()
  const router = useRouter()
  const goal = useApi<GoalResponse>("goal")
  const weighIns = useApi<WeighInsResponse>("weigh-ins")
  const latest = weighIns.data?.weigh_ins[0]
  const [editing, setEditing] = useState(false)
  const [mode, setMode] = useState<Mode | null>(null)
  const [goalText, setGoalText] = useState("")
  const [pace, setPace] = useState<Pace | null>(null)
  const [saving, setSaving] = useState(false)

  const g = goal.data?.goal
  const m = mode ?? g?.mode ?? "maintain"
  const p = pace ?? g?.pace ?? "standard"
  const goalKg = parseDecimal(goalText) ?? (mode == null ? (g?.goal_weight_kg ?? null) : null)
  const weight = latest?.weight_kg ?? g?.start_weight_kg ?? null
  const profile = me.profile
  const dirOk = m === "maintain" || (goalKg != null && weight != null && (m === "gain" ? goalKg > weight : goalKg < weight))

  const request = useMemo<PlanPreviewRequest | null>(() => {
    if (!profile || weight == null || !dirOk) return null
    return {
      sex: profile.sex,
      date_of_birth: profile.date_of_birth,
      height_cm: profile.height_cm,
      weight_kg: weight,
      activity_level: profile.activity_level,
      mode: m,
      goal_weight_kg: m === "maintain" ? null : goalKg,
      pace: "standard",
    }
  }, [profile, weight, m, goalKg, dirOk])

  async function save() {
    if (!dirOk) return
    setSaving(true)
    try {
      const res = await api.post<GoalResponse>("goal", { mode: m, goal_weight_kg: m === "maintain" ? null : goalKg, pace: p })
      goal.setData(res)
      toast.success("New goal saved. Today's targets are updated.")
      setEditing(false)
      setMode(null)
      setPace(null)
      setGoalText("")
      router.refresh()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <PageHeader back="/me" backLabel="Back to Me" eyebrow="Me" title="Goal and targets" />
      {goal.error && !g ? (
        goal.error.status === 404 ? null : <ErrorCard message={goal.error.message} onRetry={() => void goal.reload()} />
      ) : !g ? (
        <Skeleton className="h-[180px] rounded-card" />
      ) : (
        <section aria-label="Current goal" className="flex flex-col gap-3 rounded-card bg-white p-4">
          <span className="text-[13px] font-semibold text-muted">Since {formatDayMonth(g.started_on)}</span>
          <span className="text-[18px] font-extrabold">{goalSentence(g)}</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[34px] font-extrabold leading-none tracking-[-0.03em]">{kcal(g.plan.target_kcal)}</span>
            <span className="text-[14px] text-muted">kcal a day</span>
          </div>
          <dl className="m-0 grid grid-cols-3 gap-3 text-[14px]">
            <div>
              <dt className="text-[12px] text-muted">Protein</dt>
              <dd className="m-0 font-bold">{kcal(g.plan.macros.protein_g)} g</dd>
            </div>
            <div>
              <dt className="text-[12px] text-muted">Carbs</dt>
              <dd className="m-0 font-bold">{kcal(g.plan.macros.carbs_g)} g</dd>
            </div>
            <div>
              <dt className="text-[12px] text-muted">Fat</dt>
              <dd className="m-0 font-bold">{kcal(g.plan.macros.fat_g)} g</dd>
            </div>
            <div>
              <dt className="text-[12px] text-muted">Maintenance</dt>
              <dd className="m-0 font-bold">{kcal(g.plan.maintenance_kcal)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[12px] text-muted">Forecast</dt>
              <dd className="m-0 font-bold">{g.plan.forecast_date ? formatMonthYear(g.plan.forecast_date) : "–"}</dd>
            </div>
          </dl>
        </section>
      )}

      {!editing ? (
        <Button variant="outline" size="md" onClick={() => setEditing(true)} disabled={!profile}>
          Change goal
        </Button>
      ) : (
        <section aria-label="New goal" className="flex flex-col gap-3">
          <p className="m-0 text-[14px] text-muted">
            A new goal starts from your latest weigh-in{latest ? ` (${num1(latest.weight_kg)} kg on ${formatDayMonth(latest.date)})` : ""}.
          </p>
          <div role="radiogroup" aria-label="Goal" className="flex gap-1.5">
            {(["gain", "lose", "maintain"] as const).map((x) => (
              <Chip key={x} selected={m === x} onClick={() => setMode(x)}>
                {x === "gain" ? "Gain" : x === "lose" ? "Lose" : "Maintain"}
              </Chip>
            ))}
          </div>
          {m !== "maintain" ? (
            <Field
              label="Goal weight (kg)"
              htmlFor="goal-kg"
              hint={!dirOk && goalKg != null ? <span className="font-semibold text-danger">That&apos;s the wrong direction for this goal.</span> : undefined}
            >
              <TextInput
                id="goal-kg"
                inputMode="decimal"
                value={goalText}
                placeholder={g?.goal_weight_kg != null ? num1(g.goal_weight_kg) : "70"}
                onChange={(e) => {
                  setGoalText(e.target.value)
                  if (mode == null) setMode(m)
                }}
              />
            </Field>
          ) : null}
          {request ? (
            m === "maintain" ? null : <PacePicker request={request} pace={p} onPace={setPace} goalLabel={`${num1(goalKg ?? 0)} kg`} />
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" size="md" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button size="md" onClick={save} loading={saving} disabled={!dirOk}>
              Save goal
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}
