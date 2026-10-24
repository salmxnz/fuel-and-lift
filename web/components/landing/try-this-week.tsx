"use client"

// "Three things to try this week", from the welcome email, as a hover
// accordion: the open panel shows its step and drawing; the others shrink to
// strips that clip their giant number. On phones it's a plain list.

import { motion, useScroll, useTransform } from "motion/react"
import { useRef, useState, type CSSProperties, type ReactNode } from "react"
import { EASE_OUT } from "@/lib/motion"
import { cn } from "@/lib/cn"
import { Camera, CloudPuff, Coin, Dumbbell, Heart, Peach, Polaroid, Strawberry } from "./art"
import { SplitWords } from "./reveal"

type Step = { title: string; body: string; color: string; art: ReactNode; extra?: ReactNode }

const STEPS: Step[] = [
  {
    title: "Snap your next meal",
    body: "Take a photo and get an estimate in seconds. Fix anything that looks off before you save it.",
    color: "text-ink",
    art: <SnapArt />,
  },
  {
    title: "Start your first workout",
    body: "Your plan is waiting in Gym, with a rest timer built in. Weights fill in from your first session.",
    color: "text-protein",
    art: <LiftArt />,
  },
  {
    title: "Bring a friend",
    body: "Send a friend link and cheer each other on. Invite 8 and you get Pro forever.",
    color: "text-carbs",
    art: <FriendsArt />,
    extra: <FriendDots filled={3} />,
  },
]

export function TryThisWeek() {
  const ref = useRef<HTMLElement>(null)
  const [active, setActive] = useState(0)
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] })
  const cloudX = useTransform(scrollYProgress, [0, 1], [0, 60])

  return (
    <section
      ref={ref}
      id="start"
      aria-labelledby="try-title"
      className="relative overflow-hidden bg-white max-[760px]:pb-10 max-[760px]:pt-[12vh] min-[761px]:h-svh min-[761px]:min-h-[700px]"
    >
      <motion.div style={{ x: cloudX }} aria-hidden="true" className="pointer-events-none absolute -left-[14vw] top-[2vh] z-[3] w-[62vw] opacity-90 min-[761px]:-left-[4vw] min-[761px]:top-[4vh] min-[761px]:w-[min(34vw,500px)]">
        <CloudPuff className="drift-a w-full" seed={14} />
        {[
          [6, 34, 14],
          [24, 60, 12],
          [40, 26, 12],
        ].map(([l, t, w], i) => (
          <span key={i} className="bite-glass flicker" style={{ left: `${l}%`, top: `${t}%`, width: `${w}%`, "--delay": `${i * 1.3}s` } as CSSProperties} />
        ))}
      </motion.div>

      <div className="relative z-[4] flex flex-col items-center gap-3 px-5 text-center min-[761px]:absolute min-[761px]:inset-x-0 min-[761px]:top-[9vh]">
        <p className="m-0 text-[14px] font-bold text-protein">Your first week</p>
        <SplitWords
          id="try-title"
          text={"Three things to try\nthis week."}
          className="m-0 text-[clamp(34px,4.4vw,64px)] font-black leading-[0.98] tracking-[-0.045em] text-ink"
        />
      </div>

      <ol className="acc-track m-0 list-none p-0">
        {STEPS.map((s, i) => (
          <li
            key={s.title}
            tabIndex={0}
            data-active={active === i}
            aria-label={`Step ${i + 1}: ${s.title}`}
            className="acc-panel"
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onClick={() => setActive(i)}
          >
            <motion.div
              className="acc-in"
              initial={{ opacity: 0, y: 120 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: "some" }}
              transition={{ duration: 1.1, ease: EASE_OUT, delay: i * 0.12 }}
            >
              <span aria-hidden="true" className={cn("acc-num", s.color)}>
                {i + 1}
              </span>
              <div className="acc-step">
                <div aria-hidden="true" className="acc-art">
                  {s.art}
                </div>
                <h3 className="m-0 mb-3 text-[clamp(22px,1.9vw,30px)] font-extrabold leading-[1.1] tracking-[-0.03em] text-ink">{s.title}</h3>
                <p className="m-0 max-w-[40ch] text-[16px] leading-[1.45] text-ink-soft">{s.body}</p>
                {s.extra}
              </div>
            </motion.div>
          </li>
        ))}
      </ol>
    </section>
  )
}

/* ------------------------------------------------------------ Panel drawings */

function SnapArt() {
  return (
    <div className="float relative aspect-[5/4] w-full" style={{ "--t": "7s" } as CSSProperties}>
      <Polaroid meal="egg" className="absolute left-0 top-[6%] w-[42%] -rotate-[10deg]" />
      <Polaroid meal="donut" className="absolute right-0 top-0 w-[40%] rotate-[9deg]" />
      <Camera className="absolute bottom-0 left-[16%] w-[68%] drop-shadow-[0_14px_24px_rgba(46,26,36,0.25)]" />
    </div>
  )
}

function LiftArt() {
  return (
    <div className="relative aspect-[5/4] w-full">
      <div className="float absolute left-[4%] top-[18%] w-[86%]" style={{ "--r": "-14deg", "--t": "6s" } as CSSProperties}>
        <Dumbbell className="w-full drop-shadow-[0_14px_24px_rgba(46,26,36,0.25)]" />
      </div>
      <div className="absolute bottom-[4%] right-[6%] flex items-center gap-2 rounded-full bg-ink px-3.5 py-2 text-[14px] font-extrabold text-white shadow-[0_10px_24px_rgba(46,26,36,0.25)]">
        <span className="h-2 w-2 rounded-full bg-pink" />
        Rest 1:24
      </div>
    </div>
  )
}

function FriendsArt() {
  return (
    <div className="relative aspect-[5/4] w-full">
      <Heart className="float absolute left-[40%] top-0 w-[22%]" style={{ "--t": "4.5s" } as CSSProperties} />
      <Peach className="absolute bottom-0 left-[2%] w-[48%]" />
      <Strawberry face className="absolute bottom-0 right-[4%] w-[40%]" />
    </div>
  )
}

/** The "3 of 8" friend tracker from the emails. */
export function FriendDots({ filled, dark }: { filled: number; dark?: boolean }) {
  return (
    <div className={cn("mt-5 rounded-[18px] p-4", dark ? "bg-night-2" : "bg-sheet ring-1 ring-line-soft")}>
      <p className={cn("m-0 mb-3 flex justify-between text-[13px] font-bold", dark ? "text-white" : "text-ink")}>
        Invite friends, get Pro forever
        <span className={dark ? "text-pink" : "text-protein"}>{filled} of 8</span>
      </p>
      <ol className="m-0 flex list-none gap-1.5 p-0" aria-label={`${filled} of 8 friends joined`}>
        {Array.from({ length: 8 }, (_, i) =>
          i < filled ? (
            <li key={i} className="w-full max-w-[36px]">
              <Coin className="w-full" />
            </li>
          ) : (
            <li
              key={i}
              className={cn(
                "flex aspect-square w-full max-w-[36px] items-center justify-center rounded-full border-[1.5px] border-dashed text-[10px] font-semibold",
                dark ? "border-night-line text-night-dim" : "border-dash text-muted"
              )}
            >
              {i + 1}
            </li>
          )
        )}
      </ol>
    </div>
  )
}
