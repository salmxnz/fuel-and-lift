"use client"

import { useState } from "react"
import { ErrorCard, Skeleton } from "@/components/ui/primitives"
import { ChevronDownIcon } from "@/components/ui/icons"
import type {
  GoalResponse,
  ProgressCaloriesResponse,
  ProgressExerciseResponse,
  ProgressRecordsResponse,
  ProgressWeightResponse,
} from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { cn } from "@/lib/cn"
import { addDays, addMonths, formatDayMonth, formatMonthYear, todayISO, weekDays, weekdayLetter } from "@/lib/dates"
import { kcal, num1, signed } from "@/lib/format"
import { Sparkline, WeightChart } from "./weight-chart"
import { RewardsCard } from "./rewards-card"

type Range = "3m" | "6m" | "goal"

export function ProgressScreen() {
  const today = todayISO()
  const goalRes = useApi<GoalResponse>("goal")
  const goal = goalRes.data?.goal ?? null
  const [range, setRange] = useState<Range>("goal")
  const canGoal = !!goal
  const effective: Range = range === "goal" && !canGoal ? "3m" : range

  let from = addMonths(today, -3)
  let to = today
  if (effective === "6m") from = addMonths(today, -6)
  if (effective === "goal" && goal) {
    from = goal.started_on < today ? goal.started_on : addDays(today, -14)
    to = goal.plan.forecast_date && goal.plan.forecast_date > today ? goal.plan.forecast_date : addMonths(today, 3)
  }

  // Wait for the goal before choosing the range, so we fetch once.
  const weight = useApi<ProgressWeightResponse>(goalRes.loading ? null : `progress/weight?from=${from}&to=${to}`)

  const week = weekDays(today)
  const calories = useApi<ProgressCaloriesResponse>(`progress/calories?from=${week[0]}&to=${week[6]}`)
  const records = useApi<ProgressRecordsResponse>("progress/records")
  const [exerciseId, setExerciseId] = useState<string | null>(null)
  const recordList = records.data?.records ?? []
  const pickedId = exerciseId ?? recordList[0]?.exercise_id ?? null
  const exercise = useApi<ProgressExerciseResponse>(pickedId ? `progress/exercises/${encodeURIComponent(pickedId)}` : null)

  const wd = weight.data
  const g = wd?.goal ?? goal
  const latest = wd ? [...wd.weigh_ins].sort((a, b) => (a.date < b.date ? 1 : -1))[0] : undefined

  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-end justify-between">
        <h1 className="m-0 text-[30px] font-extrabold tracking-[-0.02em]">Progress</h1>
        <div role="radiogroup" aria-label="Range" className="flex rounded-full bg-white p-[3px]">
          {(
            [
              ["3m", "3M"],
              ["6m", "6M"],
              ["goal", "To goal"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={effective === v}
              disabled={v === "goal" && !canGoal}
              onClick={() => setRange(v)}
              className={cn(
                "min-h-[36px] rounded-full px-2.5 text-[12px] disabled:opacity-40",
                effective === v ? "bg-ink font-bold text-white" : "text-muted"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <RewardsCard />

      {/* Weight */}
      <section aria-label="Weight" className="flex flex-col gap-3 rounded-card bg-white p-4">
        {weight.error && !wd ? (
          <ErrorCard message={weight.error.message} onRetry={() => void weight.reload()} className="p-0" />
        ) : !wd ? (
          <>
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-[132px]" />
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <h2 className="m-0 text-[13px] font-semibold text-muted">Weight</h2>
                <span className="text-[34px] font-extrabold leading-none tracking-[-0.03em]">
                  {latest ? num1(latest.weight_kg) : "–"} <span className="text-[14px] font-medium text-muted">kg</span>
                </span>
              </div>
              {g?.goal_weight_kg != null && g.plan.forecast_date ? (
                <div className="flex flex-col items-end gap-0.5 text-right">
                  <span className="text-[12px] text-muted">{num1(g.goal_weight_kg)} kg around</span>
                  <span className="text-[16px] font-bold">{formatMonthYear(g.plan.forecast_date)}</span>
                </div>
              ) : g?.mode === "maintain" ? (
                <span className="text-[13px] font-semibold text-muted">Maintaining</span>
              ) : null}
            </div>
            {wd.weigh_ins.length === 0 && wd.plan.length === 0 ? (
              <div className="rounded-tile border-[1.5px] border-dashed border-dash p-3.5 text-[14px] text-muted">
                No weigh-ins in this range yet. Use the + button to log one.
              </div>
            ) : (
              <WeightChart from={from} to={to} weighIns={wd.weigh_ins} trend={wd.trend} plan={wd.plan} goal={g} />
            )}
            <p className="m-0 text-[12px] text-muted">
              {wd.trend.length > 1
                ? "Green line is your trend, dots are weigh-ins, dashed line is your plan."
                : "Dashed line is your plan. Weigh in weekly and your real trend draws over it."}
            </p>
          </>
        )}
      </section>

      {/* Strength */}
      <section aria-label="Strength" className="flex flex-col gap-2.5 rounded-card bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="m-0 text-[13px] font-semibold text-muted">Strength, top set</h2>
          {recordList.length > 0 ? (
            <label className="relative flex min-h-[36px] items-center gap-1 rounded-full border border-line pl-2.5 pr-7 text-[13px] font-semibold">
              <span className="sr-only">Exercise</span>
              <select
                value={pickedId ?? ""}
                onChange={(e) => setExerciseId(e.target.value)}
                className="max-w-[170px] appearance-none truncate bg-transparent outline-none"
              >
                {recordList.map((r) => (
                  <option key={r.exercise_id} value={r.exercise_id}>
                    {r.exercise_name}
                  </option>
                ))}
              </select>
              <ChevronDownIcon size={14} className="pointer-events-none absolute right-2.5" />
            </label>
          ) : null}
        </div>
        {records.loading ? (
          <Skeleton className="h-16" />
        ) : records.error ? (
          <p className="m-0 text-[14px] text-danger">{records.error.message}</p>
        ) : recordList.length === 0 ? (
          <div className="rounded-tile border-[1.5px] border-dashed border-dash p-3.5 text-[14px] text-muted">
            Finish a workout and your top sets and records show up here.
          </div>
        ) : (
          <>
            {exercise.data && exercise.data.points.length > 0 ? (
              (() => {
                const pts = exercise.data.points
                const last = pts[pts.length - 1]
                const delta = last.top_kg - pts[0].top_kg
                return (
                  <>
                    <div className="flex flex-wrap items-center gap-3.5">
                      <span className="text-[26px] font-extrabold tracking-[-0.02em]">
                        {num1(last.top_kg)} kg <span className="text-[14px] font-semibold text-muted">× {last.top_reps}</span>
                      </span>
                      {pts.length > 1 && Math.abs(delta) >= 0.1 ? (
                        <span className={cn("rounded-full px-2 py-1 text-[13px] font-bold", delta > 0 ? "bg-pink" : "bg-warn-bg")}>
                          {signed(delta, 1)} kg since {formatDayMonth(pts[0].date)}
                        </span>
                      ) : null}
                    </div>
                    <Sparkline
                      points={pts.map((p) => ({ date: p.date, v: p.top_kg }))}
                      label={`${exercise.data.exercise.name} top set over ${pts.length} sessions, now ${num1(last.top_kg)} kg`}
                    />
                  </>
                )
              })()
            ) : exercise.loading ? (
              <Skeleton className="h-12" />
            ) : null}
            <ul aria-label="Personal records" className="m-0 flex list-none flex-col p-0">
              {recordList.map((r) => (
                <li key={r.exercise_id} className="flex justify-between gap-3 border-t border-line-soft py-2.5 text-[14px]">
                  <span>{r.exercise_name}</span>
                  <span className="font-bold">
                    {num1(r.kg)} kg × {r.reps}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Calories this week */}
      <CaloriesWeek data={calories.data} error={calories.error?.message} loading={calories.loading} week={week} today={today} />
    </div>
  )
}

function CaloriesWeek({
  data,
  error,
  loading,
  week,
  today,
}: {
  data: ProgressCaloriesResponse | undefined
  error?: string
  loading: boolean
  week: string[]
  today: string
}) {
  const byDate = new Map((data?.days ?? []).map((d) => [d.date, d]))
  const target = data?.days.find((d) => d.target_kcal > 0)?.target_kcal ?? 0
  const maxVal = Math.max(target * 1.2, ...(data?.days ?? []).map((d) => d.kcal), 1)
  const H = 84
  const targetY = target > 0 ? H - (target / maxVal) * H : 0
  const logged = (data?.days ?? []).filter((d) => d.kcal > 0)
  const summary =
    logged.length === 0
      ? "Nothing logged this week yet"
      : logged.map((d) => `${weekdayLetter(d.date)} ${kcal(d.kcal)} kcal`).join(", ")

  return (
    <section aria-label="Calories this week" className="flex flex-col gap-2.5 rounded-card bg-white p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="m-0 text-[13px] font-semibold text-muted">Calories this week</h2>
        {target ? <span className="text-[12px] text-muted">Target {kcal(target)}</span> : null}
      </div>
      {loading ? (
        <Skeleton className="h-[84px]" />
      ) : error ? (
        <p className="m-0 text-[14px] text-danger">{error}</p>
      ) : (
        <>
          <div role="img" aria-label={summary} className="relative grid grid-cols-7 items-end gap-2" style={{ height: H }}>
            {target ? (
              <span aria-hidden="true" className="absolute inset-x-0 border-t border-dashed border-dash" style={{ top: targetY }} />
            ) : null}
            {week.map((d) => {
              const v = byDate.get(d)?.kcal ?? 0
              const h = v > 0 ? Math.max(6, (v / maxVal) * H) : 4
              const isToday = d === today
              return (
                <span
                  key={d}
                  className={cn(
                    "box-border",
                    v <= 0
                      ? "rounded-sm bg-line-soft"
                      : isToday
                        ? "hatch-pink rounded-md border-[1.5px] border-ink"
                        : target && v > target * 1.1
                          ? "rounded-md bg-fat"
                          : "rounded-md bg-pink"
                  )}
                  style={{ height: h }}
                />
              )
            })}
          </div>
          <div aria-hidden="true" className="grid grid-cols-7 gap-2 text-center text-[11px] text-muted">
            {week.map((d) => (
              <span key={d} className={d === today ? "font-bold text-ink" : undefined}>
                {weekdayLetter(d)}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
