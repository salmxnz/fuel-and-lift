"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/cn"
import { CloseButton } from "./primitives"

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function useMounted() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    // Portals need document; flip after hydration.
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])
  return mounted
}

/** Lock page scroll, trap Tab, close on Escape and restore focus on close. */
function useDialogBehaviour(open: boolean, panel: React.RefObject<HTMLElement | null>, onClose: () => void) {
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = "hidden"

    const focusFirst = requestAnimationFrame(() => {
      const el = panel.current
      if (!el) return
      const auto = el.querySelector<HTMLElement>("[data-autofocus]")
      ;(auto ?? el).focus({ preventScroll: true })
    })

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== "Tab" || !panel.current) return
      const nodes = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.offsetParent !== null || n === document.activeElement
      )
      if (nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => {
      cancelAnimationFrame(focusFirst)
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = overflow
      previouslyFocused?.focus?.({ preventScroll: true })
    }
  }, [open, panel])
}

export type SheetProps = {
  open: boolean
  onClose: () => void
  title: ReactNode
  /** Visually hide the title (still labels the dialog). */
  hideTitle?: boolean
  description?: ReactNode
  children: ReactNode
  /** Sheet surface: #FFF8FA (default, over light screens) or ground. */
  surface?: "sheet" | "ground"
  showClose?: boolean
  className?: string
}

/** Bottom sheet dialog, portalled to <body> so no ancestor filter/transform traps it. */
export function Sheet({
  open,
  onClose,
  title,
  hideTitle,
  description,
  children,
  surface = "sheet",
  showClose = true,
  className,
}: SheetProps) {
  const mounted = useMounted()
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()
  const reduce = useReducedMotion()
  useDialogBehaviour(open, panel, onClose)

  if (!mounted) return null
  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50" key="sheet">
          <motion.button
            type="button"
            aria-label="Close"
            tabIndex={-1}
            className="scrim absolute inset-0 h-full w-full cursor-default"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            className={cn(
              "absolute inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] w-full max-w-[var(--app-max)] flex-col gap-3.5 overflow-y-auto rounded-t-sheet px-4 pt-2.5 outline-none",
              surface === "sheet" ? "bg-sheet" : "bg-ground",
              className
            )}
            style={{ paddingBottom: "calc(var(--safe-bottom) + 28px)" }}
            initial={reduce ? { opacity: 0 } : { y: "100%" }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: "100%" }}
            transition={reduce ? { duration: 0 } : { type: "spring", damping: 32, stiffness: 360 }}
          >
            <span aria-hidden="true" className="h-[5px] w-10 flex-none self-center rounded-[3px] bg-line" />
            <div className={cn("flex items-center justify-between gap-3", hideTitle && "sr-only")}>
              <h2 id={titleId} className="m-0 text-[24px] font-extrabold tracking-[-0.02em]">
                {title}
              </h2>
              {showClose && !hideTitle ? <CloseButton onClick={onClose} /> : null}
            </div>
            {description ? (
              <p id={descId} className="m-0 -mt-1.5 text-[15px] leading-[1.45] text-muted">
                {description}
              </p>
            ) : null}
            {children}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  )
}

/** Unstyled full-screen overlay (Add menu). Same focus/escape behaviour. */
export function Overlay({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean
  onClose: () => void
  label: string
  children: ReactNode
}) {
  const mounted = useMounted()
  const panel = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  useDialogBehaviour(open, panel, onClose)
  if (!mounted) return null
  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="overlay"
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          tabIndex={-1}
          className="fixed inset-0 z-50 outline-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.18 }}
        >
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            className="scrim absolute inset-0 h-full w-full cursor-default"
            onClick={onClose}
          />
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  )
}
