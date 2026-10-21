// Motion tokens for motion/react, mirroring the CSS ones in app/globals.css.
// See docs/brand/BRAND.md (Motion).

/** Strong ease-out for things entering, leaving or responding to a tap. */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const
/** Strong ease-in-out for things already on screen that move or morph. */
export const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const
/** iOS-like drawer curve. */
export const EASE_DRAWER = [0.32, 0.72, 0, 1] as const

/** Quick, no-bounce spring: the nav lens, selected pills, spotlights. */
export const SPRING_SNAPPY = { type: "spring", stiffness: 520, damping: 38, mass: 0.8 } as const
/** Bottom sheets. */
export const SPRING_SHEET = { type: "spring", damping: 32, stiffness: 360 } as const
/** Rare celebrations (a streak milestone): a little bounce is allowed. */
export const SPRING_POP = { type: "spring", duration: 0.5, bounce: 0.2 } as const

/** A horizontal page change (dates, versions): slide in from the swipe side. */
export const PAGE_SLIDE = { duration: 0.24, ease: EASE_OUT } as const

/**
 * Whether a horizontal drag should change page: past 30% of the width, or a
 * deliberate flick (over 0.11 px/ms with some travel). Returns +1 for "next"
 * (dragged left), -1 for "previous" (dragged right), 0 to snap back.
 */
export function swipeDirection(offsetX: number, velocityX: number, width: number): -1 | 0 | 1 {
  const far = Math.abs(offsetX) > width * 0.3
  // motion reports velocity in px/s.
  const flick = Math.abs(velocityX) > 110 && Math.abs(offsetX) > 24
  if (!far && !flick) return 0
  return offsetX < 0 ? 1 : -1
}

/** Variants for AnimatePresence with `custom={direction}` (+1 next, -1 previous). */
export const pageVariants = {
  enter: (dir: number) => ({ opacity: 0, transform: `translateX(${dir * 24}px)` }),
  center: { opacity: 1, transform: "translateX(0px)" },
  exit: (dir: number) => ({ opacity: 0, transform: `translateX(${dir * -24}px)` }),
}
