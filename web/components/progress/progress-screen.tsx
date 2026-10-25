"use client"

import { useState } from "react"
import { Sky, SkyTitle } from "@/components/ui/sky"
import { PeriodRecap } from "./period-recap"
import { ErrorCard, Skeleton } from "@/components/ui/primitives"
import { ChevronDownIcon } from "@/components/ui/icons"
import type {
  GoalResponse,
  ProgressExerciseResponse,
  ProgressRecordsResponse,
  ProgressWeightResponse,
} from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { cn } from "@/lib/cn"
import { addDays, addMonths, formatDayMonth, formatMonthYear, todayISO } from "@/lib/dates"
import { num1, signed } from "@/lib/format"
import { Sparkline, WeightChart } from "./weight-chart"
import { RewardsCard } from "./rewards-card"

type Range = "3m" | "6m" | "goal"
type View = "week" | "month"

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

  const [view, setView] = useState<View>("week")
  const [offset, setOffset] = useState(0)
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
      <Sky className="pb-14">
        <SkyTitle title="Progress">
          <div role="radiogroup" aria-label="View" className="flex rounded-[14px] border border-white/85 bg-white/65 p-1 backdrop-blur-md">
            {(["week", "month"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={view === v}
                onClick={() => {
                  setView(v)
                  setOffset(0)
                }}
                className={cn(
                  "min-h-[36px] rounded-[10px] px-3 text-[13px] font-bold transition-colors duration-200",
                  view === v ? "bg-ink text-white" : "text-ink-soft"
                )}
              >
                {v === "week" ? "Week" : "Month"}
              </button>
            ))}
          </div>
        </SkyTitle>
        <PeriodRecap view={view} offset={offset} onOffset={setOffset} today={today} />
      </Sky>

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
            <div role="radiogroup" aria-label="Weight range" className="-mt-1 flex self-end rounded-full bg-field p-[3px]">
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
                  className={cn("min-h-[32px] rounded-full px-2.5 text-[12px] disabled:opacity-40", effective === v ? "bg-ink font-bold text-white" : "text-muted")}
                >
                  {label}
                </button>
              ))}
            </div>
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
                ? "The line is your trend, dots are weigh-ins, dashed line is your plan."
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

    </div>
  )
}
