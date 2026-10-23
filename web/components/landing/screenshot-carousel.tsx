"use client"

// App Store-style screenshot cards: a bold headline over a phone that runs off
// the bottom edge. ScreenshotCarousel is a native scroll-snap row (swipe on
// touch, arrows with a mouse); MarqueeRow drifts on its own and stops when
// touched, hovered or when the visitor prefers reduced motion.

import { useCallback, useEffect, useRef, useState } from "react"
import { BackIcon, ChevronRightIcon } from "@/components/ui/icons"
import { cn } from "@/lib/cn"
import { PhonePlaceholder, type ScreenKind } from "./phone-placeholder"

export type SlideTone = "pink" | "lilac" | "sand" | "mint" | "night"

export type Slide = {
  title: string
  tone: SlideTone
  screen: ScreenKind
  /** A real screenshot (portrait phone screen) replaces the placeholder. */
  image?: { src: string; alt: string }
}

// Flat brand colours, no gradients: the screenshot is the interesting part.
const TONES: Record<SlideTone, string> = {
  pink: "bg-pink text-ink",
  lilac: "bg-lilac text-ink",
  sand: "bg-sand text-ink",
  mint: "bg-pink-soft text-ink",
  night: "bg-night text-white",
}

/** Page gutter that lines the first card up with the 1080px content column. */
const GUTTER = "max(20px, calc((100% - 1080px) / 2 + 20px))"

export function ScreenshotCard({ slide, size = "lg" }: { slide: Slide; size?: "lg" | "sm" }) {
  return (
    <figure
      className={cn(
        "m-0 flex aspect-[9/17] flex-col overflow-hidden",
        size === "lg" ? "w-[70vw] max-w-[280px] gap-6 rounded-[28px] px-6 pt-7" : "w-[180px] gap-4 rounded-[20px] px-4 pt-5",
        TONES[slide.tone]
      )}
    >
      <figcaption
        className={cn(
          "m-0 text-balance font-extrabold tracking-[-0.03em]",
          size === "lg" ? "text-[26px] leading-[1.02]" : "text-[17px] leading-[1.05]"
        )}
      >
        {slide.title}
      </figcaption>
      <PhonePlaceholder screen={slide.screen} image={slide.image} className="mx-auto w-[84%] flex-none" />
    </figure>
  )
}

export function ScreenshotCarousel({ slides, label, heading }: { slides: Slide[]; label: string; heading?: React.ReactNode }) {
  const track = useRef<HTMLUListElement>(null)
  const [edge, setEdge] = useState({ start: true, end: false })

  const update = useCallback(() => {
    const el = track.current
    if (!el) return
    const start = el.scrollLeft <= 4
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4
    setEdge((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
  }, [])

  useEffect(() => {
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [update])

  function step(dir: 1 | -1) {
    const el = track.current
    const first = el?.firstElementChild as HTMLElement | null
    if (!el || !first) return
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    el.scrollBy({ left: dir * (first.offsetWidth + gap), behavior: reduce ? "auto" : "smooth" })
  }

  return (
    <section aria-roledescription="carousel" aria-label={label} className="flex flex-col gap-6">
      <div className="mx-auto flex w-full max-w-[1080px] items-end justify-between gap-4 px-5">
        <div className="min-w-0">{heading}</div>
        {/* Arrows only with a mouse; touch swipes the row directly. */}
        <div className="hidden flex-none gap-2 [@media(hover:hover)_and_(pointer:fine)]:flex">
          <ArrowButton label="Previous" disabled={edge.start} onClick={() => step(-1)}>
            <BackIcon size={20} />
          </ArrowButton>
          <ArrowButton label="Next" disabled={edge.end} onClick={() => step(1)}>
            <ChevronRightIcon size={20} />
          </ArrowButton>
        </div>
      </div>
      <ul
        ref={track}
        onScroll={update}
        tabIndex={0}
        aria-label={`${label}, scrolls sideways`}
        className="no-scrollbar m-0 flex list-none snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain p-0 pb-2"
        style={{ paddingInline: GUTTER, scrollPaddingInline: GUTTER }}
      >
        {slides.map((s, i) => (
          <li key={s.title} className="flex-none snap-start" aria-roledescription="slide" aria-label={`${i + 1} of ${slides.length}`}>
            <ScreenshotCard slide={s} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function ArrowButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-white text-ink transition-[transform,opacity] duration-150 ease-out hover:border-ink active:scale-[0.94] disabled:opacity-35"
    >
      {children}
    </button>
  )
}

/**
 * A self-moving row. Each half of the track holds the slides twice (so it's
 * wider than a desktop screen), and the track holds two halves so the loop is
 * seamless.
 */
export function MarqueeRow({ slides, label, reverse }: { slides: Slide[]; label: string; reverse?: boolean }) {
  const [paused, setPaused] = useState(false)
  const half = [...slides, ...slides]
  return (
    <div
      role="region"
      aria-label={label}
      className="no-scrollbar overflow-hidden motion-reduce:overflow-x-auto"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      <ul
        className="marquee-track m-0 flex w-max list-none p-0 motion-reduce:animate-none"
        data-paused={paused}
        style={{ animationDirection: reverse ? "reverse" : undefined, ["--marquee-duration" as string]: `${half.length * 6}s` }}
      >
        {[...half, ...half].map((s, i) => (
          // Spacing is padding, not gap, so both halves are exactly the same width.
          <li key={i} className={cn("flex-none pr-3", i >= slides.length && "motion-reduce:hidden")} aria-hidden={i >= slides.length || undefined}>
            <ScreenshotCard slide={s} size="sm" />
          </li>
        ))}
      </ul>
    </div>
  )
}
