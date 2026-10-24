"use client"

import Link from "next/link"
import { motion, useMotionValue, useScroll, useSpring, useTransform, type MotionValue } from "motion/react"
import { Fragment, useRef, type CSSProperties, type ReactNode } from "react"
import { Logo } from "@/components/brand/logo"
import { cn } from "@/lib/cn"
import { bankPath, CloudPuff, Donut, Dumbbell, Egg, Sparkle, Strawberry } from "./art"
import { InstallCta } from "./install-cta"
import { HERO_POSTER, HERO_VIDEO } from "./landing-media"
import { PhonePlaceholder } from "./phone-placeholder"

const TITLE = ["Eat.", "Lift.", "Add", "it", "up."]

// Frosted bite tiles, as [left %, top %] within the hero. Middle ones are smaller.
const GLASS: [number, number][] = [
  [3, 64],
  [3, 71],
  [6.5, 71],
  [10, 71],
  [3, 78],
  [-1, 70],
  [30, 84],
  [33.5, 84],
  [33.5, 80],
  [86, 58],
  [86, 67],
  [82, 76],
  [89.5, 76],
  [86, 84],
  [64, 86],
]

const BACK_BANK = bankPath({ width: 1600, height: 760, baseline: 560, rMin: 40, rMax: 90, seed: 4 })
const MID_BANK = bankPath({ width: 1600, height: 760, baseline: 640, rMin: 34, rMax: 70, seed: 9 })
const FRONT_BANK = bankPath({ width: 1600, height: 200, baseline: 120, rMin: 30, rMax: 62, seed: 21 })

export function Hero() {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] })

  // Scroll parallax: the title lifts away, clouds drift up, the phone rises.
  const titleY = useTransform(scrollYProgress, [0, 1], ["0%", "-60%"])
  const cloudLY = useTransform(scrollYProgress, [0, 1], [0, -120])
  const cloudRY = useTransform(scrollYProgress, [0, 1], [0, -180])
  const sceneY = useTransform(scrollYProgress, [0, 1], ["0%", "8%"])
  const phoneY = useTransform(scrollYProgress, [0, 1], ["0%", "-34%"])

  // Pointer parallax for the floating food, eased with a soft spring.
  const px = useMotionValue(0)
  const py = useMotionValue(0)
  const mx = useSpring(px, { stiffness: 60, damping: 18 })
  const my = useSpring(py, { stiffness: 60, damping: 18 })

  return (
    <section
      ref={ref}
      className="relative h-svh min-h-[640px] overflow-hidden bg-white"
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse") return
        const r = e.currentTarget.getBoundingClientRect()
        px.set(((e.clientX - r.left) / r.width) * 2 - 1)
        py.set(((e.clientY - r.top) / r.height) * 2 - 1)
      }}
    >
      {/* Floating pill nav */}
      <nav
        aria-label="Main"
        className="hero-nav absolute left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-[18px] bg-white/90 p-1.5 pl-4 shadow-[0_0_0_1px_rgba(46,26,36,0.06),0_8px_24px_rgba(168,47,97,0.10)] backdrop-blur-md sm:gap-2"
        style={{ top: "calc(var(--safe-top) + 18px)" }}
      >
        <Link href="/" aria-label="adebite home" className="mr-1 flex h-10 items-center sm:mr-8">
          <Logo height={22} />
        </Link>
        <a href="#install" className="hidden h-10 items-center rounded-[12px] px-3 text-[14px] font-bold text-ink-soft no-underline hover:text-ink sm:flex">
          How to install
        </a>
        <Link href="/login" className="flex h-10 items-center whitespace-nowrap rounded-[12px] px-2.5 text-[14px] font-bold text-ink-soft no-underline hover:text-ink sm:px-3">
          Sign in
        </Link>
        <a
          href="#install"
          className="flex h-10 items-center whitespace-nowrap rounded-[12px] bg-ink px-4 text-[14px] font-bold text-white no-underline shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_4px_10px_rgba(46,26,36,0.22)] transition-transform duration-150 ease-out hover:-translate-y-px active:scale-[0.97]"
        >
          Install
        </a>
      </nav>

      {/* Clouds, top corners */}
      <motion.div style={{ y: cloudLY }} className="pointer-events-none absolute -left-[18vw] top-[6%] z-[3] w-[70vw] sm:-left-[5%] sm:-top-[3%] sm:w-[min(44vw,640px)]">
        <div className="hero-cloud-l">
          <CloudPuff className="drift-a w-full" tail="right" seed={3} />
        </div>
      </motion.div>
      <motion.div style={{ y: cloudRY }} className="pointer-events-none absolute -right-[20vw] top-[10%] z-[3] w-[66vw] sm:-right-[6%] sm:top-[2%] sm:w-[min(42vw,620px)]">
        <div className="hero-cloud-r">
          <CloudPuff className="drift-b w-full" tail="left" seed={8} />
        </div>
      </motion.div>

      {/* Headline, line and the button */}
      <motion.div style={{ y: titleY }} className="relative z-[9] flex flex-col items-center px-5 pt-[calc(var(--safe-top)+18svh)] text-center sm:pt-[17svh]">
        <h1 className="m-0 max-w-[11ch] text-[clamp(56px,9.4vw,148px)] font-black leading-[0.9] tracking-[-0.055em] text-ink sm:max-w-none">
          {TITLE.map((w, i) => (
            <Fragment key={w}>
              <span className="hero-word" style={{ "--w": i } as CSSProperties}>
                {w}
              </span>
              {i < TITLE.length - 1 ? " " : null}
              {i === 1 ? <br className="sm:hidden" /> : null}
            </Fragment>
          ))}
        </h1>
        <div className="hero-fade mt-6 flex w-full max-w-[400px] flex-col items-center gap-6">
          <p className="m-0 max-w-[36ch] text-[17px] leading-[1.5] text-ink-soft">
            Calories from a photo of your plate, a gym plan that moves up when you do, and a few friends to keep you going.
          </p>
          <InstallCta align="center" />
        </div>
      </motion.div>

      {/* The scene: sky, the bitten-a sun, cloud banks (or the video) */}
      <motion.div
        style={{ y: sceneY }}
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-[60%] [mask-image:linear-gradient(to_bottom,transparent_0,#000_24%)] max-sm:h-[52%]"
      >
        {HERO_VIDEO ? (
          <video
            className="absolute inset-0 h-full w-full object-cover object-[center_70%]"
            src={HERO_VIDEO}
            poster={HERO_POSTER ?? undefined}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
          />
        ) : (
          <>
            <div className="absolute inset-0 bg-[linear-gradient(to_bottom,#fff_0%,#fdeef3_30%,#f9d3df_70%,#f6c1d2_100%)]" />
            <svg viewBox="0 0 1600 760" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full">
              <defs>
                <radialGradient id="hero-glow">
                  <stop offset="0%" stopColor="#fff" stopOpacity="0.95" />
                  <stop offset="60%" stopColor="#fff" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#fff" stopOpacity="0" />
                </radialGradient>
              </defs>
              <path d={BACK_BANK} fill="#f4b9cd" />
              <circle cx="800" cy="700" r="420" fill="url(#hero-glow)" />
              <circle className="spin-slow" cx="800" cy="700" r="320" fill="none" stroke="#fff" strokeWidth="4" strokeDasharray="1 16" strokeLinecap="round" />
              <circle cx="800" cy="700" r="250" fill="#fff" opacity="0.92" />
              <path d={MID_BANK} fill="#f9d6e2" />
            </svg>
          </>
        )}
      </motion.div>

      {/* The phone, rising out of the clouds */}
      <motion.div
        style={{ y: phoneY }}
        className="pointer-events-none absolute left-1/2 top-[67%] z-[5] w-[min(300px,58vw)] -translate-x-1/2 max-sm:top-[74%]"
      >
        <div className="hero-phone-in">
          <PhonePlaceholder screen="today" />
        </div>
      </motion.div>

      {/* Floating food, with pointer parallax by depth */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[6]">
        <Floater mx={mx} my={my} depth={22} className="left-[8%] top-[58%] w-[clamp(64px,8vw,124px)] max-sm:left-[3%] max-sm:top-[66%]" r={-8} t={6.5} d={0.1}>
          <Egg className="w-full drop-shadow-[0_10px_18px_rgba(168,47,97,0.18)]" />
        </Floater>
        <Floater mx={mx} my={my} depth={34} className="left-[17%] top-[76%] w-[clamp(52px,6.4vw,100px)] max-sm:left-[8%] max-sm:top-[84%]" r={-12} t={7.5} d={0.25}>
          <Strawberry className="w-full drop-shadow-[0_10px_18px_rgba(168,47,97,0.22)]" />
        </Floater>
        <Floater mx={mx} my={my} depth={26} className="right-[9%] top-[58%] w-[clamp(90px,11vw,170px)] max-sm:right-[1%] max-sm:top-[64%]" r={-22} t={8} d={0.18}>
          <Dumbbell className="w-full drop-shadow-[0_10px_18px_rgba(46,26,36,0.22)]" />
        </Floater>
        <Floater mx={mx} my={my} depth={38} className="right-[17%] top-[77%] w-[clamp(56px,6.8vw,108px)] max-sm:right-[7%] max-sm:top-[84%]" r={10} t={6.8} d={0.32}>
          <Donut className="w-full drop-shadow-[0_10px_18px_rgba(168,47,97,0.22)]" />
        </Floater>
        {[
          [26, 54, 18, 2.6, 0],
          [72, 50, 14, 3.4, 0.8],
          [44, 62, 10, 2.8, 1.6],
          [58, 58, 16, 3.1, 0.4],
          [92, 46, 12, 2.4, 1.2],
          [12, 48, 12, 3.6, 2],
        ].map(([l, t, s, dur, delay], i) => (
          <span key={i} className="absolute" style={{ left: `${l}%`, top: `${t}%`, width: s }}>
            <Sparkle className="twinkle w-full" style={{ "--t": `${dur}s`, "--delay": `${delay}s` } as CSSProperties} />
          </span>
        ))}
      </div>

      {/* Front cloud bank: the phone rises from behind it */}
      <svg
        aria-hidden="true"
        viewBox="0 0 1600 200"
        preserveAspectRatio="xMidYMax slice"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[7] h-[150px] w-full sm:h-[200px]"
      >
        <path d={FRONT_BANK} fill="#fff" />
      </svg>

      {/* Frosted bite tiles */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[8]">
        {GLASS.map(([x, y], i) => {
          const small = x > 25 && x < 70
          return (
            <span
              key={i}
              className={cn("hero-pop absolute", i % 2 === 1 && "max-sm:hidden")}
              style={{ left: `${x}%`, top: `${y}%`, width: small ? "clamp(26px,3.2vw,44px)" : "clamp(34px,5vw,70px)", "--d": ((i * 37) % 11) / 20 } as CSSProperties}
            >
              <span
                className="bite-glass flicker relative block w-full"
                style={{ "--t": `${4 + ((i * 13) % 5)}s`, "--delay": `${(i * 7) % 4}s` } as CSSProperties}
              />
            </span>
          )
        })}
      </div>
    </section>
  )
}

function Floater({
  mx,
  my,
  depth,
  className,
  children,
  r,
  t,
  d,
}: {
  mx: MotionValue<number>
  my: MotionValue<number>
  depth: number
  className: string
  children: ReactNode
  r: number
  t: number
  d: number
}) {
  const x = useTransform(mx, (v) => v * -depth)
  const y = useTransform(my, (v) => v * -depth * 0.6)
  return (
    <motion.div style={{ x, y }} className={cn("absolute", className)}>
      <div className="hero-pop" style={{ "--d": d } as CSSProperties}>
        <div className="float" style={{ "--r": `${r}deg`, "--t": `${t}s`, "--delay": `${-d * 4}s` } as CSSProperties}>
          {children}
        </div>
      </div>
    </motion.div>
  )
}
