"use client"

// Lenis smooth scrolling for the landing page only. It drives the real
// window scroll, so sticky sections and motion's useScroll keep working.
// Off with reduced motion; touch scrolling stays native.

import Lenis from "lenis"
import { useEffect } from "react"

export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const lenis = new Lenis({
      duration: 1.25,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      autoRaf: true,
      anchors: { duration: 1.6 },
    })
    return () => lenis.destroy()
  }, [])
  return null
}
