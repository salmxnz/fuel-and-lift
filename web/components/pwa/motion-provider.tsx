"use client"

import { MotionConfig } from "motion/react"

/** Honour prefers-reduced-motion for every motion animation in the app. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}
