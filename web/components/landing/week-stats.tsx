"use client"

// "Here's how it added up": the weekly recap email as a pinned section.
// While it's pinned, scrolling counts the numbers up and the sun (the mark on
// a pink disc) rises from behind the clouds and the frosted band.

import { motion, useScroll, useTransform, type MotionValue } from "motion/react"
import { useRef, type CSSProperties, type ReactNode } from "react"
import { BarcodeIcon, BowlIcon, CameraIcon, ChatIcon, DumbbellIcon, FireIcon, PencilIcon, ScaleIcon, StoreIcon } from "@/components/ui/icons"
import { EASE_OUT } from "@/lib/motion"
import { bankPath, r2, seeded, Sparkle, Symbol } from "./art"
import { Reveal, SplitWords } from "./reveal"

type Stat = { label: string; to: number; dec: number; pre?: string; suf?: string; note: string; icon: ReactNode }

const STATS: Stat[] = [
  { label: "Days logged", to: 6, dec: 0, suf: " / 7", note: "Every day counts", icon: <PencilIcon size={18} /> },
  { label: "Average a day", to: 2080, dec: 0, note: "Target 2,150 kcal", icon: <FireIcon size={18} /> },
  { label: "Workouts", to: 3, dec: 0, note: "Sessions finished", icon: <DumbbellIcon size={18} /> },
  { label: "Weight", to: 0.4, dec: 1, pre: "−", suf: " kg", note: "Since last week", icon: <ScaleIcon size={18} /> },
]

const WAYS = [
  { label: "Photo", icon: <CameraIcon size={20} /> },
  { label: "Describe it", icon: <ChatIcon size={20} /> },
  { label: "Restaurant menu", icon: <StoreIcon size={20} /> },
  { label: "Barcode", icon: <BarcodeIcon size={20} /> },
  { label: "Saved meal", icon: <BowlIcon size={20} /> },
]

const FRONT = bankPath({ width: 1600, height: 160, baseline: 96, rMin: 28, rMax: 58, seed: 33 })

export function WeekStats() {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] })
  const count = useTransform(scrollYProgress, [0.05, 0.7], [0, 1], { clamp: true })
  const sunY = useTransform(scrollYProgress, [0, 0.85], ["82%", "-22%"])
  const sunScale = useTransform(scrollYProgress, [0, 0.8], [0.9, 1])

  return (
    <section ref={ref} aria-labelledby="week-title" className="relative h-[230vh] bg-white">
      <div className="sticky top-0 h-svh min-h-[660px] overflow-hidden">
        <SquareField count={22} seed={5} />

        {/* The rising sun */}
        <motion.div
          style={{ y: sunY, scale: sunScale }}
          aria-hidden="true"
          className="absolute bottom-[-4%] left-1/2 z-[1] w-[min(720px,120vw)] -translate-x-1/2"
        >
          <svg viewBox="0 0 600 340" className="w-full">
            <defs>
              <radialGradient id="week-glow">
                <stop offset="0%" stopColor="#f6b8ca" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#f6b8ca" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx="300" cy="300" r="300" fill="url(#week-glow)" />
            <circle className="spin-slow" cx="300" cy="300" r="255" fill="none" stroke="#f6b8ca" strokeWidth="3" strokeDasharray="1 14" strokeLinecap="round" />
            <circle cx="300" cy="300" r="205" fill="#f6b8ca" />
          </svg>
          <Symbol fill="#fff" className="absolute left-1/2 top-[30%] w-[22%] -translate-x-1/2" />
          {[
            [8, 30, 16, 2.8, 0],
            [88, 22, 12, 3.2, 1],
            [76, 6, 10, 2.6, 0.5],
            [18, 4, 12, 3.6, 1.6],
          ].map(([l, t, s, dur, delay], i) => (
            <span key={i} className="absolute" style={{ left: `${l}%`, top: `${t}%`, width: s }}>
              <Sparkle fill="#f6b8ca" className="twinkle w-full" style={{ "--t": `${dur}s`, "--delay": `${delay}s` } as CSSProperties} />
            </span>
          ))}
        </motion.div>

        {/* Clouds the sun rises from */}
        <svg aria-hidden="true" viewBox="0 0 1600 160" preserveAspectRatio="xMidYMax slice" className="absolute inset-x-0 bottom-0 z-[2] h-[120px] w-full sm:h-[150px]">
          <path d={FRONT} fill="#fff" />
        </svg>

        <div className="relative z-[3] flex h-full flex-col items-center justify-center gap-5 px-4 pb-[8vh]">
          <Reveal as="p" className="m-0 text-[14px] font-bold text-protein">
            A week in adebite
          </Reveal>
          <SplitWords
            id="week-title"
            text="Here's how it added up."
            className="m-0 mb-3 text-center text-[clamp(34px,4.4vw,64px)] font-black leading-[0.98] tracking-[-0.045em] text-ink"
          />

          <ul className="m-0 grid w-full max-w-[900px] list-none grid-cols-2 gap-3 p-0 md:grid-cols-4">
            {STATS.map((s, i) => (
              <motion.li
                key={s.label}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.8, ease: EASE_OUT, delay: i * 0.08 }}
                className="ticket flex h-[132px] flex-col justify-between rounded-[22px] bg-pink-soft px-5 py-4 sm:h-[156px]"
              >
                <span className="flex items-center gap-2 text-[13px] font-semibold text-ink-soft">
                  <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-white text-protein">{s.icon}</span>
                  {s.label}
                </span>
                <span className="flex flex-col gap-0.5">
                  <Counter value={count} stat={s} />
                  <span className="text-[12px] text-muted">{s.note}</span>
                </span>
              </motion.li>
            ))}
          </ul>
          <div aria-hidden="true" className="-mt-4 h-[10px] w-[min(820px,94%)] rounded-[50%] bg-[radial-gradient(closest-side,rgba(168,47,97,0.10),transparent)]" />

          {/* Ways to log, over a frosted band where the sun passes behind */}
          <div className="relative mt-2 flex w-full max-w-[900px] flex-col items-center gap-3">
            <div
              aria-hidden="true"
              className="absolute left-1/2 top-[22px] z-0 h-[64px] w-[min(440px,80vw)] -translate-x-1/2 bg-white/20 backdrop-blur-[14px] [mask-image:linear-gradient(90deg,transparent,#000_18%,#000_82%,transparent)] max-[900px]:hidden"
            />
            <Reveal as="p" className="relative z-[1] m-0 text-[13px] font-semibold text-muted">
              Log a meal the way that suits it
            </Reveal>
            <ul className="relative z-[1] m-0 flex w-full list-none flex-wrap items-center justify-center gap-x-7 gap-y-3 p-0 md:justify-between md:gap-x-6">
              {WAYS.map((w, i) => (
                <Reveal as="li" key={w.label} delay={0.1 + i * 0.06} className="flex items-center gap-2 whitespace-nowrap text-[16px] font-extrabold tracking-[-0.02em] text-ink sm:text-[20px]">
                  <span className="text-protein">{w.icon}</span>
                  {w.label}
                </Reveal>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

function Counter({ value, stat }: { value: MotionValue<number>; stat: Stat }) {
  const text = useTransform(value, (p) => {
    const n = (stat.to * p).toLocaleString("en-GB", { minimumFractionDigits: stat.dec, maximumFractionDigits: stat.dec })
    return `${stat.pre ?? ""}${n}${stat.suf ?? ""}`
  })
  return (
    <span className="text-[clamp(30px,3.4vw,44px)] font-black leading-none tracking-[-0.04em] text-ink">
      <span className="sr-only">
        {stat.pre}
        {stat.to.toLocaleString("en-GB")}
        {stat.suf}
      </span>
      <motion.span aria-hidden="true">{text}</motion.span>
    </span>
  )
}

/** Faint rounded squares blinking in and out across the top of a section. */
export function SquareField({ count, seed }: { count: number; seed: number }) {
  const rand = seeded(seed)
  const squares = Array.from({ length: count }, () => ({
    col: Math.floor(rand() * 30),
    row: Math.floor(rand() * 6),
    t: r2(3 + rand() * 4),
    delay: r2(rand() * 4),
  }))
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[42%] [mask-image:linear-gradient(#000,transparent)]">
      {squares.map((s, i) => (
        <span
          key={i}
          className="sq"
          style={{ left: s.col * 48 - 10, top: s.row * 48 + 6, "--t": `${s.t}s`, "--delay": `${s.delay}s` } as CSSProperties}
        />
      ))}
    </div>
  )
}
