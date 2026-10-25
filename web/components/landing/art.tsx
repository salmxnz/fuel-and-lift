// Drawn illustrations for the landing page, in the same style as the
// transactional emails: flat shapes, the brand palette, soft pink shadows.
// Everything here is decorative (aria-hidden) and safe to render on the server.

import { useId } from "react"
import { SYMBOL } from "@/components/brand/logo"
import { cn } from "@/lib/cn"
import { bankPath, r2, seeded } from "@/lib/clouds"

type ArtProps = { className?: string; style?: React.CSSProperties }

const PINK = "#F6B8CA"
const PINK_SOFT = "#FBDCE6"
const ROSE = "#A82F61"
const CARBS = "#EE8FB0"
const FAT = "#F2B48C"
const INK = "#2E1A24"

/* ------------------------------------------------------------ Brand mark */

/** The bitten "a" on its own. Colour comes from `fill`. */
export function Symbol({ className, style, fill = PINK }: ArtProps & { fill?: string }) {
  return (
    <svg viewBox="40 30 184 190" className={className} style={style} aria-hidden="true">
      <path fill={fill} fillRule="evenodd" d={SYMBOL} />
    </svg>
  )
}

/* ------------------------------------------------------------ Clouds */

// Shared with the app's sky header.
export { bankPath, r2, seeded }

/** A full-width scalloped edge, for section seams. Fill is the colour below. */
export function CloudEdge({ fill, className, seed = 7, flip }: ArtProps & { fill: string; seed?: number; flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 1600 90"
      preserveAspectRatio="none"
      className={cn("block h-[48px] w-full sm:h-[70px]", flip && "rotate-180", className)}
      aria-hidden="true"
    >
      <path d={bankPath({ width: 1600, height: 90, baseline: 62, rMin: 26, rMax: 52, seed })} fill={fill} />
    </svg>
  )
}

/* ------------------------------------------------------------ Sky bits */

export function Sparkle({ className, style, fill = "#fff" }: ArtProps & { fill?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden="true">
      <path d="M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12 7-1 11-5 12-12z" fill={fill} />
    </svg>
  )
}

/** A puffy cloud: big round head on one side, a wispy tail on the other. */
export function CloudPuff({ className, style, tail = "right", seed = 3 }: ArtProps & { tail?: "left" | "right"; seed?: number }) {
  const rand = seeded(seed)
  // Puffs shrink along the tail. Shadow copy sits a few px lower in pink.
  const puffs: { x: number; y: number; r: number }[] = []
  let x = 90
  let r = 78
  while (r > 14) {
    puffs.push({ x: r2(x), y: r2(120 - r * 0.55 + rand() * 10), r: r2(r) })
    x += r * (0.95 + rand() * 0.35)
    r *= 0.72 + rand() * 0.1
  }
  puffs.push({ x: 40, y: 128, r: 46 })
  puffs.push({ x: 150, y: 70, r: 60 })
  return (
    <svg viewBox="-20 -20 520 200" className={cn(tail === "left" && "-scale-x-100", className)} style={style} aria-hidden="true">
      <g fill="#F5C3D4">
        {puffs.map((p, i) => (
          <circle key={`s${i}`} cx={p.x} cy={p.y + 9} r={p.r} />
        ))}
      </g>
      <g fill="#FCE4EC">
        {puffs.map((p, i) => (
          <circle key={`c${i}`} cx={p.x} cy={p.y} r={p.r} />
        ))}
      </g>
      <g fill="#fff" opacity="0.85">
        <ellipse cx="120" cy="58" rx="46" ry="18" />
        <ellipse cx="62" cy="96" rx="22" ry="10" />
      </g>
    </svg>
  )
}

/* ------------------------------------------------------------ Food and kit */

export function Egg({ className, style }: ArtProps) {
  return (
    <svg viewBox="0 0 120 110" className={className} style={style} aria-hidden="true">
      <path
        d="M60 6c16 0 22 10 34 13 14 3 23 15 19 29 7 12 3 28-11 34-6 14-22 22-38 18-14 6-32 0-38-14C10 81 2 66 10 52 4 38 12 22 28 18 35 10 46 6 60 6z"
        fill="#fff"
      />
      <circle cx="62" cy="54" r="21" fill={FAT} />
      <circle cx="62" cy="54" r="15" fill="#F0A274" />
      <ellipse cx="55" cy="47" rx="6" ry="4.5" fill="#FADCC4" transform="rotate(-30 55 47)" />
    </svg>
  )
}

export function Strawberry({ className, style, face }: ArtProps & { face?: boolean }) {
  const seeds = [
    [34, 52],
    [50, 48],
    [66, 52],
    [28, 68],
    [44, 66],
    [60, 66],
    [74, 68],
    [38, 84],
    [54, 84],
    [68, 82],
    [48, 100],
  ]
  return (
    <svg viewBox="0 0 100 124" className={className} style={style} aria-hidden="true">
      <path d="M50 30c24 0 44 8 44 31 0 27-24 53-44 59C30 114 6 88 6 61 6 38 26 30 50 30z" fill={CARBS} />
      <path d="M78 40c12 6 16 14 16 21 0 27-24 53-44 59 18-12 34-36 34-58 0-9-2-16-6-22z" fill="#E77AA0" />
      {face ? (
        <g stroke={INK} strokeWidth="3.4" strokeLinecap="round" fill="none">
          <path d="M30 66q6 6 12 0" />
          <path d="M58 66q6 6 12 0" />
          <path d="M42 80q8 8 16 0" />
        </g>
      ) : (
        seeds.map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx="2.4" ry="3.6" fill="#FFE6EE" />)
      )}
      {face ? (
        <>
          <ellipse cx="26" cy="78" rx="7" ry="4.5" fill="#F7A8C2" />
          <ellipse cx="74" cy="78" rx="7" ry="4.5" fill="#F7A8C2" />
        </>
      ) : null}
      <path
        d="M50 34c-6-9-18-14-30-10 9 3 15 7 17 13-11-2-20 2-24 9 13-2 24-1 32-5 9 4 20 5 34 3-4-7-13-11-24-9 2-6 8-10 17-13-12-4-25 1-30 10z"
        fill={ROSE}
      />
      <rect x="47" y="14" width="6" height="16" rx="3" fill={ROSE} />
    </svg>
  )
}

export function Donut({ className, style }: ArtProps) {
  const id = useId()
  const rand = seeded(11)
  const sprinkles = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2 + rand() * 0.3
    const rr = 22 + rand() * 10
    return { x: r2(50 + Math.cos(a) * rr), y: r2(50 + Math.sin(a) * rr), rot: r2(rand() * 180), c: [INK, "#fff", ROSE, FAT][i % 4] }
  })
  return (
    <svg viewBox="0 0 100 100" className={className} style={style} aria-hidden="true">
      <defs>
        <mask id={`${id}hole`}>
          <rect width="100" height="100" fill="#fff" />
          <circle cx="50" cy="50" r="12" fill="#000" />
        </mask>
      </defs>
      <g mask={`url(#${id}hole)`}>
        <circle cx="50" cy="52" r="46" fill="#E9A47C" />
        <circle cx="50" cy="50" r="46" fill={FAT} />
        <g fill="#F7A8C2">
          <circle cx="50" cy="50" r="36" />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2
            return <circle key={i} cx={r2(50 + Math.cos(a) * 36)} cy={r2(50 + Math.sin(a) * 36 + 2)} r="6.5" />
          })}
        </g>
        {sprinkles.map((s, i) => (
          <rect key={i} x={r2(s.x - 1.6)} y={r2(s.y - 4.5)} width="3.2" height="9" rx="1.6" fill={s.c} transform={`rotate(${s.rot} ${s.x} ${s.y})`} />
        ))}
      </g>
    </svg>
  )
}

export function Dumbbell({ className, style }: ArtProps) {
  return (
    <svg viewBox="0 0 150 64" className={className} style={style} aria-hidden="true">
      <rect x="22" y="28" width="106" height="8" rx="4" fill={ROSE} />
      <rect x="14" y="10" width="16" height="44" rx="6" fill={INK} />
      <rect x="31" y="15" width="11" height="34" rx="5" fill={INK} />
      <rect x="120" y="10" width="16" height="44" rx="6" fill={INK} />
      <rect x="108" y="15" width="11" height="34" rx="5" fill={INK} />
      <rect x="17" y="14" width="4" height="14" rx="2" fill="#fff" opacity="0.25" />
      <rect x="123" y="14" width="4" height="14" rx="2" fill="#fff" opacity="0.25" />
    </svg>
  )
}

export function Camera({ className, style }: ArtProps) {
  return (
    <svg viewBox="0 0 160 124" className={className} style={style} aria-hidden="true">
      <rect x="54" y="12" width="52" height="24" rx="8" fill={INK} />
      <rect x="8" y="28" width="144" height="88" rx="20" fill={INK} />
      <circle cx="80" cy="72" r="34" fill={PINK} />
      <circle cx="80" cy="72" r="24" fill="#fff" />
      <circle cx="80" cy="72" r="16" fill={INK} />
      <circle cx="74" cy="66" r="5" fill="#fff" />
      <rect x="120" y="40" width="20" height="9" rx="4.5" fill={PINK} />
      <rect x="20" y="40" width="22" height="6" rx="3" fill="#fff" opacity="0.18" />
    </svg>
  )
}

/** A tilted instant photo of a meal. */
export function Polaroid({ className, style, meal = "egg" }: ArtProps & { meal?: "egg" | "donut" }) {
  return (
    <div className={cn("rounded-[10px] bg-white p-[7%] pb-[22%] shadow-[0_14px_30px_-10px_rgba(168,47,97,0.35)]", className)} style={style} aria-hidden="true">
      <div className="flex aspect-square items-center justify-center rounded-[6px] bg-pink-soft">
        {meal === "egg" ? <Egg className="w-[70%]" /> : <Donut className="w-[64%]" />}
      </div>
    </div>
  )
}

export function Peach({ className, style }: ArtProps) {
  return (
    <svg viewBox="0 0 120 124" className={className} style={style} aria-hidden="true">
      <circle cx="60" cy="70" r="50" fill={FAT} />
      <path d="M60 22c-4 18-2 40 6 60" stroke="#E79E74" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.6" />
      <ellipse cx="34" cy="82" rx="9" ry="5.5" fill="#F29C9C" />
      <ellipse cx="86" cy="82" rx="9" ry="5.5" fill="#F29C9C" />
      <g stroke={INK} strokeWidth="3.6" strokeLinecap="round" fill="none">
        <path d="M34 70q7 7 14 0" />
        <path d="M72 70q7 7 14 0" />
        <path d="M52 84q8 8 16 0" />
      </g>
      <path d="M62 22c6-12 20-16 30-12-6 10-18 14-30 12z" fill={ROSE} />
    </svg>
  )
}

export function Heart({ className, style, fill = "#C83E78" }: ArtProps & { fill?: string }) {
  return (
    <svg viewBox="0 0 100 92" className={className} style={style} aria-hidden="true">
      <path d="M50 88C20 66 4 50 4 30 4 15 16 4 30 4c9 0 16 5 20 12 4-7 11-12 20-12 14 0 26 11 26 26 0 20-16 36-46 58z" fill={fill} />
      <ellipse cx="28" cy="24" rx="8" ry="5" fill="#fff" opacity="0.35" transform="rotate(-30 28 24)" />
    </svg>
  )
}

/** The rosette from the "Pro is yours" email: scalloped seal, ribbons, the mark. */
export function Rosette({ className, style }: ArtProps) {
  const bumps = 18
  return (
    <svg viewBox="0 0 240 280" className={className} style={style} aria-hidden="true">
      <path d="M86 170l-22 96 26-16 18 24 16-90z" fill="#C83E78" />
      <path d="M154 170l22 96-26-16-18 24-16-90z" fill={ROSE} />
      <g fill={PINK}>
        <circle cx="120" cy="120" r="92" />
        {Array.from({ length: bumps }, (_, i) => {
          const a = (i / bumps) * Math.PI * 2
          return <circle key={i} cx={r2(120 + Math.cos(a) * 92)} cy={r2(120 + Math.sin(a) * 92)} r="17" />
        })}
      </g>
      <circle cx="120" cy="120" r="78" fill="none" stroke="#fff" strokeWidth="3" strokeDasharray="1 9" strokeLinecap="round" />
      <circle cx="120" cy="120" r="64" fill="#FCE4EC" />
      <path fill="#fff" fillRule="evenodd" d={SYMBOL} transform="translate(58 61.3) scale(0.47)" />
    </svg>
  )
}

/** A friend coin: the white mark on a pink disc, like an app icon. */
export function Coin({ className, style }: ArtProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} style={style} aria-hidden="true">
      <circle cx="24" cy="24" r="24" fill={PINK} />
      <path fill="#fff" fillRule="evenodd" d={SYMBOL} transform="translate(1.56 2.75) scale(0.17)" />
    </svg>
  )
}

export const ART_COLORS = { PINK, PINK_SOFT, ROSE, CARBS, FAT, INK }
