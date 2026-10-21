"use client"

import { useEffect, useState } from "react"
import { Skeleton } from "@/components/ui/primitives"
import { ApiError, api } from "@/lib/api/client"
import type { Pace, Plan, PlanPreviewRequest, PlanPreviewResponse } from "@/lib/api/types"
import { cn } from "@/lib/cn"
import { formatMonthYear } from "@/lib/dates"
import { kcal, num1, signed } from "@/lib/format"

const PACES: { id: Pace; name: string; pct: string }[] = [
  { id: "slow", name: "Slow", pct: "0.25% of body weight a week" },
  { id: "standard", name: "Standard", pct: "0.5% a week" },
  { id: "fast", name: "Fast", pct: "0.75% a week" },
]

function rate(kgPerWeek: number): string {
  const v = Math.abs(kgPerWeek)
  return v < 1 ? String(Math.round(v * 100) / 100) : num1(v)
}

/** POST /v1/plan/preview, debounced, keyed on the request. */
export function usePlanPreview(req: PlanPreviewRequest | null) {
  const key = req ? JSON.stringify(req) : null
  const [state, setState] = useState<{ key: string; data?: PlanPreviewResponse; error?: string } | null>(null)

  useEffect(() => {
    if (!key) return
    let cancelled = false
    const t = window.setTimeout(async () => {
      try {
        const data = await api.post<PlanPreviewResponse>("plan/preview", JSON.parse(key))
        if (!cancelled) setState({ key, data })
      } catch (err) {
        if (!cancelled) setState({ key, error: err instanceof ApiError ? err.message : "Couldn't work out your plan." })
      }
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [key])

  // Show the last result while a new one loads, to avoid flicker.
  const current = state && state.key === key ? state : null
  return {
    data: current?.data ?? state?.data,
    error: current?.error ?? null,
    loading: !current,
  }
}

/** Onboarding-Pace.dc.html: three paces plus the dark forecast card. */
export function PacePicker({
  request,
  pace,
  onPace,
  goalLabel,
}: {
  request: PlanPreviewRequest
  pace: Pace
  onPace: (p: Pace) => void
  goalLabel: string
}) {
  const preview = usePlanPreview(request)
  const paces = preview.data?.paces
  const plan: Plan | undefined = paces?.[pace] ?? preview.data?.plan

  return (
    <>
      <div role="radiogroup" aria-label="Pace" className="flex flex-col gap-2">
        {PACES.map((p) => {
          const selected = p.id === pace
          const pl = paces?.[p.id]
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onPace(p.id)}
              className={cn(
                "flex min-h-16 items-center justify-between gap-3 rounded-btn border-2 px-4 py-3 text-left",
                selected ? "border-ink bg-pink" : "border-transparent bg-white"
              )}
            >
              <span className="flex flex-col gap-0.5">
                <span className="text-[17px] font-bold">{p.name}</span>
                <span className={cn("text-[13px]", !selected && "text-muted")}>
                  {p.pct}
                  {pl ? `, about ${rate(pl.rate_kg_per_week)} kg` : ""}
                </span>
              </span>
              <span className={cn("flex-none whitespace-nowrap text-[15px]", selected ? "font-bold" : "font-semibold text-muted")}>
                {pl ? `${signed(pl.delta_kcal)} kcal` : <span aria-hidden="true" className="skeleton inline-block h-4 w-14" />}
              </span>
            </button>
          )
        })}
      </div>

      <section aria-live="polite" aria-label="Your forecast" className="flex flex-col gap-3.5 rounded-[20px] bg-ink p-[18px] text-white">
        {preview.error && !plan ? (
          <p className="m-0 text-[14px] text-night-soft">{preview.error}</p>
        ) : !plan ? (
          <div className="on-dark flex flex-col gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-4 w-24" />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-[13px] text-night-muted">You reach {goalLabel} around</span>
              <span className="text-[36px] font-extrabold leading-[1.05] tracking-[-0.02em] text-pink">
                {plan.forecast_date ? formatMonthYear(plan.forecast_date) : "–"}
              </span>
              {plan.weeks_to_goal != null ? (
                <span className="text-[14px] text-night-soft">About {Math.round(plan.weeks_to_goal)} weeks</span>
              ) : null}
            </div>
            <div className="h-px bg-[#452A37]" />
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-[12px] text-night-muted">Daily target</span>
                <span className="text-[20px] font-bold">{kcal(plan.target_kcal)} kcal</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[12px] text-night-muted">Maintenance</span>
                <span className="text-[20px] font-bold">{kcal(plan.maintenance_kcal)} kcal</span>
              </div>
            </div>
            {plan.warnings.length > 0 ? (
              <ul className="m-0 flex list-none flex-col gap-1 rounded-[12px] bg-night-2 p-3 text-[13px] text-[#FBDCE6]">
                {plan.warnings.map((w) => (
                  <li key={w}>{w.charAt(0).toUpperCase() + w.slice(1)}</li>
                ))}
              </ul>
            ) : null}
            <p className="m-0 text-[12px] leading-[1.4] text-night-muted">
              A starting estimate. After two to three weeks of weigh-ins, your target adjusts to how your weight actually moves.
            </p>
          </>
        )}
      </section>
    </>
  )
}
