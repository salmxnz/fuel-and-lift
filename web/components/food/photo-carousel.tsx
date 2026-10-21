"use client"

import { motion, useReducedMotion } from "motion/react"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { CloseIcon } from "@/components/ui/icons"
import { cn } from "@/lib/cn"
import { SPRING_SNAPPY } from "@/lib/motion"

export type CarouselPhoto = { key: string; src: string; alt: string }

/**
 * Swipe through up to a few meal photos (native scroll-snap), with dots.
 * `onRemove` adds a delete button on each slide.
 */
export function PhotoCarousel({
  photos,
  onRemove,
  removeLabel = "Remove photo",
  busyKey,
  overlay,
  className,
  scrollTo,
}: {
  photos: CarouselPhoto[]
  onRemove?: (key: string) => void
  removeLabel?: string
  /** The photo being removed (its button shows as busy). */
  busyKey?: string | null
  /** Shown over every slide (e.g. "Finding each item…"). */
  overlay?: ReactNode
  className?: string
  /** Scroll to this photo when it changes (e.g. a thumbnail was tapped). */
  scrollTo?: string | null
}) {
  const track = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const reduce = useReducedMotion()
  const current = Math.min(active, Math.max(0, photos.length - 1))

  useEffect(() => {
    const el = track.current
    if (!el) return
    const onScroll = () => setActive(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    const el = track.current
    const i = photos.findIndex((p) => p.key === scrollTo)
    if (el && i >= 0) el.scrollTo({ left: i * el.clientWidth, behavior: reduce ? "auto" : "smooth" })
  }, [scrollTo, photos, reduce])

  if (photos.length === 0) return null

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="relative overflow-hidden rounded-card bg-[#553646]">
        <div
          ref={track}
          aria-roledescription="carousel"
          className="no-scrollbar flex aspect-[4/3] snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
        >
          {photos.map((p, i) => (
            <figure
              key={p.key}
              aria-roledescription="slide"
              aria-label={`Photo ${i + 1} of ${photos.length}`}
              className="relative m-0 h-full w-full flex-none snap-center"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- local previews and signed R2 links */}
              <img src={p.src} alt={p.alt} draggable={false} className="h-full w-full object-cover" />
              {onRemove ? (
                <button
                  type="button"
                  aria-label={`${removeLabel} ${i + 1}`}
                  disabled={busyKey === p.key}
                  onClick={() => onRemove(p.key)}
                  className="absolute right-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-[rgba(46,26,36,0.55)] text-white backdrop-blur-sm transition-transform duration-150 ease-out active:scale-[0.97] disabled:opacity-50"
                >
                  <CloseIcon size={16} />
                </button>
              ) : null}
            </figure>
          ))}
        </div>
        {overlay ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[rgba(46,26,36,0.55)] text-[15px] font-semibold text-white">
            {overlay}
          </div>
        ) : null}
      </div>
      {photos.length > 1 ? (
        <div className="flex justify-center gap-1.5" aria-hidden="true">
          {photos.map((p, i) => (
            <span key={p.key} className="relative h-1.5 w-1.5 rounded-full bg-line">
              {i === current ? (
                <motion.span
                  layoutId="photo-dot"
                  transition={reduce ? { duration: 0 } : SPRING_SNAPPY}
                  className="absolute inset-0 rounded-full bg-ink"
                />
              ) : null}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
