"use client"

// Scroll reveals for the landing page. Words rise out of a blur one by one;
// blocks fade up. Both run once, when they come into view. With reduced
// motion, MotionConfig drops the movement and keeps the fade.

import { motion, type Variants } from "motion/react"
import type { ElementType, ReactNode } from "react"
import { EASE_OUT } from "@/lib/motion"
import { cn } from "@/lib/cn"

const word: Variants = {
  hidden: { opacity: 0, y: 22, filter: "blur(8px)" },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.9, ease: EASE_OUT, delay: i * 0.06 },
  }),
}

/** A heading whose words reveal in turn. Use "\n" for a line break. */
export function SplitWords({
  text,
  as = "h2",
  className,
  id,
}: {
  text: string
  as?: "h2" | "h3" | "p"
  className?: string
  id?: string
}) {
  const Tag = motion[as] as ElementType
  let i = 0
  return (
    <Tag id={id} className={className} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.6 }}>
      {text.split("\n").map((line, li) => (
        <span key={li} className="block">
          {line.split(" ").map((w, wi) => (
            <motion.span key={wi} custom={i++} variants={word} className="inline-block whitespace-pre will-change-transform">
              {w}
              {wi < line.split(" ").length - 1 ? " " : ""}
            </motion.span>
          ))}
        </span>
      ))}
    </Tag>
  )
}

/** Fades a block up into place. `delay` in seconds. */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 16,
  as = "div",
}: {
  children: ReactNode
  className?: string
  delay?: number
  y?: number
  as?: "div" | "li" | "p" | "span"
}) {
  const Tag = motion[as] as ElementType
  return (
    <Tag
      className={cn(className)}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.8, ease: EASE_OUT, delay }}
    >
      {children}
    </Tag>
  )
}
