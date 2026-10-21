import type { Goal, WeighIn, WeightPoint } from "@/lib/api/types"
import { addDays, daysBetween, formatShortMonthYear } from "@/lib/dates"
import { num1 } from "@/lib/format"

const W = 326
const H = 132
const LEFT = 28
const TOP = 10
const BOTTOM = 112 // plot bottom; labels underneath

function niceStep(span: number): number {
  const raw = span / 4
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 0.1)))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= raw) return m * pow
  return 10 * pow
}

/**
 * Weight over time in plain SVG: weigh-ins as dots, the smoothed trend as a
 * solid line, the plan as a dashed line to the goal, and the goal weight as a
 * dotted green rule.
 */
export function WeightChart({
  from,
  to,
  weighIns,
  trend,
  plan,
  goal,
}: {
  from: string
  to: string
  weighIns: WeighIn[]
  trend: WeightPoint[]
  plan: WeightPoint[]
  goal: Goal | null
}) {
  const span = Math.max(1, daysBetween(from, to))
  const values = [
    ...weighIns.map((w) => w.weight_kg),
    ...trend.map((p) => p.weight_kg),
    ...plan.map((p) => p.weight_kg),
    ...(goal?.goal_weight_kg != null ? [goal.goal_weight_kg] : []),
  ]
  if (values.length === 0) return null
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (max - min < 2) {
    min -= 1
    max += 1
  }
  const step = niceStep(max - min)
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 10) / 10)

  const x = (date: string) => LEFT + (Math.min(span, Math.max(0, daysBetween(from, date))) / span) * (W - LEFT)
  const y = (kg: number) => BOTTOM - ((kg - lo) / (hi - lo || 1)) * (BOTTOM - TOP)
  const inRange = (d: string) => d >= from && d <= to

  const line = (pts: WeightPoint[]) =>
    pts
      .filter((p) => inRange(p.date))
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.date).toFixed(1)} ${y(p.weight_kg).toFixed(1)}`)
      .join(" ")

  const trendPath = line(trend)
  const planPath = line(plan)
  const dots = weighIns.filter((w) => inRange(w.date))
  const latest = [...weighIns].sort((a, b) => (a.date < b.date ? 1 : -1))[0]

  // Four evenly spaced date labels.
  const labels = [0, 1 / 3, 2 / 3, 1].map((f) => {
    const iso = addDays(from, Math.round(span * f))
    return { x: LEFT + f * (W - LEFT), text: formatShortMonthYear(iso), anchor: f === 0 ? "start" : f === 1 ? "end" : "middle" }
  })

  const desc = [
    latest ? `Latest weigh-in ${num1(latest.weight_kg)} kg.` : "No weigh-ins in this range.",
    goal?.goal_weight_kg != null ? `Goal ${num1(goal.goal_weight_kg)} kg.` : "",
    planPath ? "Dashed line shows the plan." : "",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Weight chart. ${desc}`} className="block h-auto overflow-visible">
      <g stroke="#EEF0E8" strokeWidth={1}>
        {ticks.map((t) => (
          <line key={t} x1={LEFT} x2={W} y1={y(t)} y2={y(t)} />
        ))}
      </g>
      <g fontSize={10} fill="#5C6355" fontFamily="inherit">
        {ticks.map((t) => (
          <text key={t} x={0} y={y(t) + 3.2}>
            {Number.isInteger(t) ? t : t.toFixed(1)}
          </text>
        ))}
        {labels.map((l, i) => (
          <text key={i} x={l.x} y={128} textAnchor={l.anchor as "start" | "middle" | "end"}>
            {l.text}
          </text>
        ))}
      </g>
      {goal?.goal_weight_kg != null ? (
        <line
          x1={LEFT}
          x2={W}
          y1={y(goal.goal_weight_kg)}
          y2={y(goal.goal_weight_kg)}
          stroke="#3E6B1F"
          strokeWidth={1}
          strokeDasharray="2 4"
        />
      ) : null}
      {planPath ? <path d={planPath} stroke="#171A12" strokeWidth={2} strokeDasharray="6 5" fill="none" /> : null}
      {dots.map((w) => (
        <circle key={w.id} cx={x(w.date)} cy={y(w.weight_kg)} r={2.6} fill="#A3A99A" />
      ))}
      {trendPath ? <path d={trendPath} stroke="#3E6B1F" strokeWidth={2.4} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
      {latest && inRange(latest.date) ? (
        <circle cx={x(latest.date)} cy={y(latest.weight_kg)} r={6} fill="#C8F04D" stroke="#171A12" strokeWidth={2} />
      ) : null}
    </svg>
  )
}

/** Tiny line of top-set weights for the strength card. */
export function Sparkline({ points, label }: { points: { date: string; v: number }[]; label: string }) {
  if (points.length < 2) return null
  const w = 326
  const h = 56
  const vs = points.map((p) => p.v)
  const lo = Math.min(...vs)
  const hi = Math.max(...vs)
  const sx = (i: number) => (i / (points.length - 1)) * (w - 8) + 4
  const sy = (v: number) => h - 6 - ((v - lo) / (hi - lo || 1)) * (h - 12)
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${sx(i).toFixed(1)} ${sy(p.v).toFixed(1)}`).join(" ")
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={label} className="block h-auto">
      <path d={d} fill="none" stroke="#171A12" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={p.date + i} cx={sx(i)} cy={sy(p.v)} r={i === points.length - 1 ? 5 : 2.5} fill={i === points.length - 1 ? "#C8F04D" : "#171A12"} stroke="#171A12" strokeWidth={i === points.length - 1 ? 2 : 0} />
      ))}
    </svg>
  )
}
