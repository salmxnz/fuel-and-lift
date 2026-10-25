"use client"

// The end of the page: the install band, the dusk scene with the last call to
// action, and the footer whose dots gather into the mark.

import Link from "next/link"
import { motion, useAnimate, useInView, useScroll, useTransform } from "motion/react"
import { useEffect, useRef, type CSSProperties } from "react"
import { SYMBOL } from "@/components/brand/logo"
import { EASE_IN_OUT, EASE_OUT } from "@/lib/motion"
import { bankPath, CloudEdge, Egg, r2, seeded, Sparkle, Strawberry } from "./art"
import { InstallCta } from "./install-cta"
import { InstallGuide } from "./install-guide"
import { CLOSING_POSTER, CLOSING_VIDEO } from "./landing-media"
import { Reveal, SplitWords } from "./reveal"
import { SquareField } from "./week-stats"

/* ------------------------------------------------------------ Install band */

export function InstallBand() {
  return (
    <section id="install" aria-labelledby="install-title" className="theme-blush relative scroll-mt-0 bg-pink text-ink">
      <CloudEdge fill="#F6B8CA" seed={12} className="absolute inset-x-0 top-0 -translate-y-[calc(100%-1px)]" />

      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="float absolute -right-6 top-16 w-[clamp(70px,9vw,130px)]" style={{ "--r": "14deg", "--t": "7s" } as CSSProperties}>
          <Strawberry className="w-full drop-shadow-[0_12px_20px_rgba(168,47,97,0.25)]" />
        </div>
        <div className="float absolute -left-8 bottom-24 w-[clamp(80px,10vw,150px)]" style={{ "--r": "-10deg", "--t": "8s" } as CSSProperties}>
          <Egg className="w-full drop-shadow-[0_12px_20px_rgba(168,47,97,0.2)]" />
        </div>
      </div>

      <div className="relative mx-auto flex w-full max-w-[1080px] flex-col gap-10 px-5 pb-28 pt-16 sm:pt-20">
        <div className="flex flex-col gap-4">
          <Reveal as="p" className="m-0 text-[14px] font-bold text-protein">
            No App Store
          </Reveal>
          <SplitWords
            id="install-title"
            text={"Three taps to your\nHome Screen."}
            className="m-0 text-[clamp(38px,5.4vw,76px)] font-black leading-[0.95] tracking-[-0.05em] text-ink"
          />
          <Reveal as="p" delay={0.1} className="m-0 max-w-[46ch] text-[18px] leading-[1.5] text-ink-soft">
            adebite is a web app, so there&apos;s nothing to download. Add it once and it opens full screen, with its own icon and notifications.
          </Reveal>
        </div>
        <Reveal delay={0.15}>
          <InstallGuide />
        </Reveal>
        <Reveal delay={0.2} className="max-w-[360px]">
          <InstallCta showNote={false} />
        </Reveal>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------ Dusk */

const FAR = bankPath({ width: 1600, height: 900, baseline: 620, rMin: 50, rMax: 110, seed: 51 })
const MID = bankPath({ width: 1600, height: 900, baseline: 720, rMin: 40, rMax: 90, seed: 52 })
const NEAR = bankPath({ width: 1600, height: 900, baseline: 810, rMin: 34, rMax: 70, seed: 53 })

const FALLING = (() => {
  const rand = seeded(77)
  const colours = ["#F6B8CA", "#EE8FB0", "#F2B48C", "#fff", "#A82F61"]
  return Array.from({ length: 24 }, (_, i) => ({
    left: r2(rand() * 100),
    dx: r2((rand() - 0.5) * 160),
    t: r2(9 + rand() * 9),
    delay: r2(-rand() * 15),
    scale: r2(0.6 + rand() * 0.8),
    kind: i % 3 === 0 ? "sprinkle" : "petal",
    colour: colours[i % colours.length],
  }))
})()

export function DuskCta() {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end end"] })
  const sceneY = useTransform(scrollYProgress, [0, 1], ["-12%", "0%"])
  const moonY = useTransform(scrollYProgress, [0, 1], [80, 0])

  return (
    <section ref={ref} aria-labelledby="dusk-title" className="relative h-[110vh] min-h-[740px] overflow-hidden bg-pink max-[760px]:h-auto max-[760px]:min-h-0">
      <SquareField count={16} seed={8} />

      {/* The scene */}
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[80%] overflow-hidden [mask-image:linear-gradient(to_bottom,transparent_0,#000_22%)] max-[760px]:relative max-[760px]:h-[92svh] max-[760px]:min-h-[640px]">
        <motion.div style={{ y: sceneY }} className="absolute inset-x-0 top-0 h-[118%]">
          {CLOSING_VIDEO ? (
            <video
              className="h-full w-full object-cover object-[center_60%]"
              src={CLOSING_VIDEO}
              poster={CLOSING_POSTER ?? undefined}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
            />
          ) : (
            <>
              <div className="absolute inset-0 bg-[linear-gradient(to_bottom,#f6b8ca_0%,#e9a0bb_22%,#b8618a_46%,#6b3352_68%,#2e1a24_100%)]" />
              <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full">
                <path d={FAR} fill="#8a4566" opacity="0.8" />
                <path d={MID} fill="#553646" />
                <path d={NEAR} fill="#2e1a24" />
              </svg>
              <motion.svg style={{ y: moonY }} viewBox="0 0 100 100" className="absolute left-[80%] top-[16%] w-[clamp(60px,7vw,110px)] max-[760px]:left-[70%] max-[760px]:top-[62%]">
                <defs>
                  <mask id="moon-cut">
                    <rect width="100" height="100" fill="#fff" />
                    <circle cx="66" cy="38" r="40" fill="#000" />
                  </mask>
                </defs>
                <circle cx="50" cy="50" r="40" fill="#fde4ec" mask="url(#moon-cut)" />
              </motion.svg>
              {[
                [12, 40, 14, 2.6, 0],
                [24, 56, 10, 3.2, 1],
                [40, 46, 12, 2.8, 0.5],
                [58, 38, 9, 3.6, 1.6],
                [86, 52, 13, 2.4, 0.8],
                [94, 34, 10, 3, 2],
                [64, 60, 8, 2.8, 1.2],
              ].map(([l, t, s, dur, delay], i) => (
                <span key={i} className="absolute" style={{ left: `${l}%`, top: `${t}%`, width: s }}>
                  <Sparkle fill="#fde4ec" className="twinkle w-full" style={{ "--t": `${dur}s`, "--delay": `${delay}s` } as CSSProperties} />
                </span>
              ))}
            </>
          )}
        </motion.div>
      </div>

      {/* Petals and sprinkles */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[3] overflow-hidden">
        {FALLING.map((f, i) => (
          <span
            key={i}
            className={`fall ${f.kind}`}
            style={
              {
                left: `${f.left}%`,
                "--dx": `${f.dx}px`,
                "--t": `${f.t}s`,
                "--delay": `${f.delay}s`,
                scale: f.scale,
                background: f.kind === "sprinkle" ? f.colour : undefined,
              } as CSSProperties
            }
          />
        ))}
      </div>

      {/* The card */}
      <motion.div
        initial={{ opacity: 0, y: 80, scale: 0.94, filter: "blur(10px)" }}
        whileInView={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 1.2, ease: EASE_OUT }}
        className="absolute left-1/2 top-[22%] z-[4] flex w-[min(680px,calc(100%-32px))] -translate-x-1/2 flex-col items-center gap-4 rounded-[26px] border border-white/70 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.96)_0%,rgba(255,255,255,0.78)_40%,rgba(255,255,255,0.14)_100%)] px-6 pb-14 pt-11 text-center shadow-[0_30px_60px_rgba(46,26,36,0.22)] backdrop-blur-[16px] max-[760px]:top-[110px] max-[760px]:px-5 max-[760px]:pb-10 max-[760px]:pt-8"
      >
        <p className="m-0 text-[14px] font-bold text-protein">Free to start</p>
        <SplitWords
          id="dusk-title"
          text="Log your first meal tonight."
          className="m-0 text-[clamp(32px,3.8vw,54px)] font-black leading-[0.98] tracking-[-0.045em] text-ink"
        />
        <p className="m-0 mb-2 max-w-[42ch] text-[16px] leading-[1.5] text-ink-soft">
          The free plan comes with 10 photo estimates a month. Add adebite to your Home Screen, sign in with Google, and you&apos;re set.
        </p>
        <InstallCta align="center" />
      </motion.div>
    </section>
  )
}

/* ------------------------------------------------------------ Footer */

export function Footer() {
  return (
    <footer className="relative bg-pink text-ink" style={{ paddingBottom: "calc(var(--safe-bottom) + 24px)" }}>
      <CloudEdge fill="#F6B8CA" seed={31} className="absolute inset-x-0 top-0 -translate-y-[calc(100%-1px)]" />
      <div className="mx-auto grid w-full max-w-[1180px] grid-cols-1 items-center justify-items-center gap-6 px-5 pt-8 sm:grid-cols-[1fr_auto_1fr] sm:justify-items-stretch">
        <div className="flex items-center gap-4">
          <FooterMark />
          <p className="m-0 max-w-[16ch] text-[16px] font-extrabold leading-[1.2] tracking-[-0.02em]">Eat, lift, and see it add up.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-6 text-[14px] font-bold">
          <a href="#start" className="no-underline hover:underline">
            Getting started
          </a>
          <a href="#pro" className="no-underline hover:underline">
            Pro
          </a>
          <a href="#install" className="no-underline hover:underline">
            How to install
          </a>
          <Link href="/login" className="no-underline hover:underline">
            Sign in
          </Link>
        </nav>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[13px] text-ink-soft sm:justify-self-end">
          <Link href="/privacy" className="font-semibold no-underline hover:underline">
            Privacy policy
          </Link>
          <Link href="/terms" className="font-semibold no-underline hover:underline">
            Terms of service
          </Link>
          <span>© 2026 adebite</span>
        </div>
      </div>
    </footer>
  )
}

/** Three dots hop, gather into one, and the mark appears where they met. */
function FooterMark() {
  const [scope, animate] = useAnimate<HTMLDivElement>()
  const inView = useInView(scope, { once: true, amount: 0.8 })

  useEffect(() => {
    if (!inView) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduce) {
      animate(".fdot", { opacity: 0 }, { duration: 0.2 })
      animate(".fmark", { opacity: 1, scale: 1 }, { duration: 0.3 })
      return
    }
    const run = async () => {
      await animate(".fdot", { y: [0, -8, 0, -8, 0] }, { duration: 1, ease: "easeInOut", delay: (i: number) => i * 0.08 })
      await animate([
        [".fdot-1", { x: 18 }, { duration: 0.45, ease: EASE_IN_OUT }],
        [".fdot-3", { x: -18 }, { duration: 0.45, ease: EASE_IN_OUT, at: "<" }],
      ])
      await animate([
        [".fdot", { opacity: 0, scale: 0.4 }, { duration: 0.15 }],
        [".fmark", { opacity: 1, scale: 1 }, { duration: 0.6, ease: EASE_OUT, at: "-0.05" }],
      ])
    }
    void run()
  }, [inView, animate])

  return (
    <div ref={scope} className="relative h-[64px] w-[64px] flex-none" aria-label="adebite" role="img">
      <svg viewBox="0 0 80 80" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        {[22, 40, 58].map((cx, i) => (
          <circle key={cx} className={`fdot fdot-${i + 1}`} cx={cx} cy="40" r="5" fill="#2E1A24" />
        ))}
      </svg>
      <svg viewBox="40 30 184 190" className="fmark absolute inset-0 h-full w-full opacity-0" style={{ scale: 0.4 }} aria-hidden="true">
        <path fill="#fff" fillRule="evenodd" d={SYMBOL} />
      </svg>
    </div>
  )
}
