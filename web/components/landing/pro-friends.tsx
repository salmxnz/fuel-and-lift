"use client"

// "Pro, for good": eight friend slots orbit the rosette from the Pro email.
// Scrolling fills them one by one; at eight the rosette pops. On wide screens
// the section pins while it fills; on phones it fills as you scroll past.

import { AnimatePresence, motion, useMotionValueEvent, useScroll, useTransform, type MotionValue } from "motion/react"
import { useRef, useState, useSyncExternalStore, type CSSProperties } from "react"
import { CameraIcon, CheckIcon } from "@/components/ui/icons"
import { EASE_OUT, SPRING_POP } from "@/lib/motion"
import { r2, seeded, Coin, Rosette, Sparkle } from "./art"
import { Reveal, SplitWords } from "./reveal"

const PERKS = [
  { title: "Unlimited photo estimates", body: "Snap every meal. There's no monthly count any more.", icon: <CameraIcon size={20} /> },
  { title: "Every meal photo, kept", body: "No cap on how many photos you store.", icon: <GalleryIcon /> },
  { title: "Yours for good", body: "Nothing to renew, nothing to cancel.", icon: <InfinityIcon /> },
]

const CONFETTI = (() => {
  const rand = seeded(42)
  return Array.from({ length: 22 }, (_, i) => {
    const a = (i / 22) * Math.PI * 2 + rand() * 0.3
    const d = 120 + rand() * 120
    return { x: Math.cos(a) * d, y: Math.sin(a) * d, r: rand() * 360, c: ["#F6B8CA", "#FBDCE6", "#EE8FB0", "#F2B48C", "#fff"][i % 5], petal: i % 3 === 0 }
  })
})()

export function ProFriends() {
  const section = useRef<HTMLElement>(null)
  const orbit = useRef<HTMLDivElement>(null)
  const [done, setDone] = useState(false)
  const [n, setN] = useState(0)

  // Two progress sources; whichever matches the layout is used.
  const pinned = useScroll({ target: section, offset: ["start start", "end end"] })
  const passing = useScroll({ target: orbit, offset: ["start 0.85", "end 0.45"] })
  const wide = useWide()
  const pinnedFill = useTransform(pinned.scrollYProgress, [0.08, 0.72], [0, 8], { clamp: true })
  const passingFill = useTransform(passing.scrollYProgress, [0, 1], [0, 8], { clamp: true })
  const fill = wide ? pinnedFill : passingFill

  useMotionValueEvent(fill, "change", (v) => {
    const next = Math.floor(v + 0.001)
    setN(next)
    setDone(next >= 8)
  })

  return (
    <section
      ref={section}
      id="pro"
      aria-labelledby="pro-title"
      className="on-dark relative bg-night text-white min-[901px]:h-[250vh]"
    >
      <div className="relative overflow-hidden min-[901px]:sticky min-[901px]:top-0 min-[901px]:h-svh min-[901px]:min-h-[700px]">
        {/* Night sky: a soft glow and twinkling stars */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_60%_at_32%_50%,#5b3446_0%,transparent_70%)]" />
        <Stars />

        <div className="relative mx-auto grid h-full w-full max-w-[1180px] items-center gap-10 px-5 py-20 min-[901px]:grid-cols-[1.05fr_1fr] min-[901px]:gap-16 min-[901px]:py-0">
          {/* The orbit */}
          <div ref={orbit} className="relative mx-auto aspect-square w-[min(520px,88vw)] min-[901px]:w-[min(520px,42vw,70vh)]">
            <svg aria-hidden="true" viewBox="0 0 100 100" className="spin-slow absolute inset-0 h-full w-full">
              <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(246,184,202,0.35)" strokeWidth="0.35" strokeDasharray="0.2 2.2" strokeLinecap="round" />
            </svg>
            {Array.from({ length: 8 }, (_, i) => (
              <Slot key={i} index={i} fill={fill} />
            ))}

            <motion.div
              className="absolute left-1/2 top-1/2 w-[44%] -translate-x-1/2 -translate-y-[46%]"
              animate={done ? { scale: 1.08, rotate: 0 } : { scale: 0.92, rotate: -6 }}
              transition={done ? SPRING_POP : { duration: 0.4, ease: EASE_OUT }}
            >
              <motion.div
                aria-hidden="true"
                className="absolute inset-[-30%] rounded-full bg-[radial-gradient(closest-side,rgba(246,184,202,0.45),transparent)]"
                animate={{ opacity: done ? 1 : 0.25 }}
                transition={{ duration: 0.6 }}
              />
              <Rosette className="relative w-full drop-shadow-[0_20px_40px_rgba(0,0,0,0.35)]" />
              <AnimatePresence>
                {done
                  ? CONFETTI.map((c, i) => (
                      <motion.span
                        key={i}
                        aria-hidden="true"
                        className="absolute left-1/2 top-[42%] block"
                        style={{
                          width: c.petal ? 11 : 4,
                          height: c.petal ? 9 : 12,
                          borderRadius: c.petal ? "80% 0 80% 0" : 2,
                          background: c.c,
                        }}
                        initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.4 }}
                        animate={{ x: c.x, y: c.y, opacity: 0, rotate: c.r, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1.1, ease: EASE_OUT }}
                      />
                    ))
                  : null}
              </AnimatePresence>
            </motion.div>
          </div>

          {/* The words */}
          <div className="flex flex-col gap-5">
            <Reveal as="p" className="m-0 text-[14px] font-bold text-pink">
              Pro, for good
            </Reveal>
            <SplitWords
              id="pro-title"
              text={"Bring 8 friends.\nKeep Pro forever."}
              className="m-0 text-[clamp(34px,4.4vw,64px)] font-black leading-[0.98] tracking-[-0.045em] text-white"
            />
            <Reveal as="p" delay={0.1} className="m-0 max-w-[46ch] text-[17px] leading-[1.5] text-night-muted">
              Each friend who joins through your link and finishes setting up counts. At 8, Pro is yours: no subscription and no end date.
            </Reveal>

            <p className="m-0 flex items-baseline gap-3" aria-live="polite">
              <span className="text-[clamp(48px,5vw,72px)] font-black leading-none tracking-[-0.05em] text-pink tabular-nums">{n}</span>
              <span className="text-[18px] font-bold text-night-soft">of 8 friends joined</span>
              <AnimatePresence>
                {done ? (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={SPRING_POP}
                    className="ml-1 flex h-8 items-center gap-1 self-center rounded-full bg-pink px-3 text-[13px] font-extrabold text-ink"
                  >
                    <CheckIcon size={14} strokeWidth={3} /> Pro
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </p>

            <ul className="m-0 mt-1 flex list-none flex-col gap-4 p-0">
              {PERKS.map((p, i) => (
                <Reveal as="li" key={p.title} delay={0.15 + i * 0.08} className="flex items-start gap-4">
                  <span className="flex h-12 w-12 flex-none items-center justify-center rounded-[14px] bg-night-2 text-pink">{p.icon}</span>
                  <span className="flex flex-col gap-0.5 pt-1">
                    <span className="text-[17px] font-extrabold tracking-[-0.01em] text-white">{p.title}</span>
                    <span className="text-[15px] text-night-muted">{p.body}</span>
                  </span>
                </Reveal>
              ))}
            </ul>
            <Reveal as="p" delay={0.3} className="m-0 text-[13px] text-night-dim">
              Free comes with 10 photo estimates a month.
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  )
}

/** One friend slot on the orbit: dashed and numbered, then a coin pops in. */
function Slot({ index, fill }: { index: number; fill: MotionValue<number> }) {
  const a = (index / 8) * Math.PI * 2 - Math.PI / 2
  const left = r2(50 + Math.cos(a) * 42)
  const top = r2(50 + Math.sin(a) * 42)
  const scale = useTransform(fill, [index, index + 0.6], [0.3, 1], { clamp: true })
  const opacity = useTransform(fill, [index, index + 0.35], [0, 1], { clamp: true })
  return (
    <div className="absolute w-[13%] -translate-x-1/2 -translate-y-1/2" style={{ left: `${left}%`, top: `${top}%` }} aria-hidden="true">
      <span className="flex aspect-square w-full items-center justify-center rounded-full border-[1.5px] border-dashed border-night-line text-[12px] font-semibold text-night-dim">
        {index + 1}
      </span>
      <motion.span style={{ scale, opacity }} className="absolute inset-0 block">
        <Coin className="h-full w-full drop-shadow-[0_6px_14px_rgba(246,184,202,0.35)]" />
      </motion.span>
    </div>
  )
}

function Stars() {
  const rand = seeded(19)
  const stars = Array.from({ length: 18 }, () => ({ l: r2(rand() * 100), t: r2(rand() * 100), s: r2(6 + rand() * 10), d: r2(rand() * 3), dur: r2(2.4 + rand() * 2) }))
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {stars.map((s, i) => (
        <span key={i} className="absolute" style={{ left: `${s.l}%`, top: `${s.t}%`, width: s.s }}>
          <Sparkle fill="#ebdbe2" className="twinkle w-full" style={{ "--t": `${s.dur}s`, "--delay": `${s.d}s` } as CSSProperties} />
        </span>
      ))}
    </div>
  )
}

const WIDE = "(min-width: 901px)"

/** Matches the layout breakpoint where the section pins. */
function useWide() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(WIDE)
      m.addEventListener("change", cb)
      return () => m.removeEventListener("change", cb)
    },
    () => window.matchMedia(WIDE).matches,
    () => false
  )
}

function GalleryIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="7" y="3" width="14" height="14" rx="3" />
      <path d="M3 8v10a3 3 0 0 0 3 3h10" />
      <circle cx="12" cy="8" r="1.6" />
      <path d="m21 13-3.5-3.5L11 16" />
    </svg>
  )
}

function InfinityIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 12c-2-2.7-3.6-4-5.5-4a4 4 0 0 0 0 8c1.9 0 3.5-1.3 5.5-4zm0 0c2 2.7 3.6 4 5.5 4a4 4 0 0 0 0-8c-1.9 0-3.5 1.3-5.5 4z" />
    </svg>
  )
}
