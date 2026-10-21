import type { Day } from "@/lib/api/types"
import { kcal, num1, pct } from "@/lib/format"

/** Calories eaten vs target with the three macro bars (Main.dc.html). */
export function CalorieCard({ day }: { day: Day }) {
  const eaten = day.totals.kcal
  const target = day.target.kcal
  const left = Math.round(target - eaten)
  const p = pct(eaten, target)
  return (
    <section aria-label="Calories" className="flex flex-col gap-3.5 rounded-card bg-white p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[40px] font-extrabold leading-none tracking-[-0.03em]">{kcal(eaten)}</span>
          <span className="text-[14px] text-muted">of {kcal(target)} kcal</span>
        </div>
        <span className="text-right text-[14px] font-semibold">
          {left >= 0 ? `${kcal(left)} to go` : `${kcal(-left)} over`}
        </span>
      </div>
      <div
        role="img"
        aria-label={`${Math.round(p)} percent of calorie target eaten`}
        className="h-3 overflow-hidden rounded-[6px] bg-line-soft"
      >
        {eaten > 0 ? (
          <div
            className="box-border h-full border-r-2 border-ink bg-pink transition-[width] duration-500"
            style={{ width: `${Math.min(100, p)}%` }}
          />
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <MacroBar label="Protein" value={day.totals.protein_g} target={day.target.protein_g} color="bg-protein" />
        <MacroBar label="Carbs" value={day.totals.carbs_g} target={day.target.carbs_g} color="bg-carbs" />
        <MacroBar label="Fat" value={day.totals.fat_g} target={day.target.fat_g} color="bg-fat" />
      </div>
    </section>
  )
}

function MacroBar({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const p = pct(value, target)
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[12px] text-muted">{label}</span>
      <span className="text-[15px] font-bold">
        {num1(value)} <span className="font-normal text-muted">/ {kcal(target)} g</span>
      </span>
      <div
        role="img"
        aria-label={`${label}: ${num1(value)} of ${kcal(target)} grams`}
        className="h-1.5 overflow-hidden rounded-[3px] bg-line-soft"
      >
        <div className={`h-full ${color}`} style={{ width: `${p}%` }} />
      </div>
    </div>
  )
}
