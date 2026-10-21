"use client"

import { motion, useReducedMotion } from "motion/react"
import { Overlay } from "@/components/ui/sheet"
import { BowlIcon, ChevronRightIcon, CloseIcon, DumbbellIcon, ScaleIcon } from "@/components/ui/icons"

const ITEMS = [
  {
    key: "food",
    title: "Food",
    sub: "Photo, your meals, a restaurant",
    tile: "bg-pink",
    icon: <BowlIcon size={26} />,
  },
  {
    key: "workout",
    title: "Workout",
    sub: "Today's plan or any template",
    tile: "bg-ink text-pink",
    icon: <DumbbellIcon size={26} strokeWidth={1.9} />,
  },
  {
    key: "weigh",
    title: "Weigh-in",
    sub: "Log today's weight",
    tile: "bg-lilac",
    icon: <ScaleIcon size={26} />,
  },
] as const

/** The + menu (Add-Menu.dc.html): three glass cards above a dark close button. */
export function AddMenu({
  open,
  onClose,
  onFood,
  onWorkout,
  onWeighIn,
}: {
  open: boolean
  onClose: () => void
  onFood: () => void
  onWorkout: () => void
  onWeighIn: () => void
}) {
  const reduce = useReducedMotion()
  const actions = { food: onFood, workout: onWorkout, weigh: onWeighIn }
  return (
    <Overlay open={open} onClose={onClose} label="Add">
      <div
        className="pointer-events-none absolute inset-x-0 mx-auto max-w-[var(--app-max)] px-4"
        style={{ bottom: "max(26px, calc(var(--safe-bottom) + 8px))" }}
      >
        <div className="pointer-events-auto ml-auto flex w-[292px] max-w-full flex-col gap-2" role="menu" aria-label="Add">
          {ITEMS.map((item, i) => (
            <motion.button
              key={item.key}
              type="button"
              role="menuitem"
              data-autofocus={i === 0 ? true : undefined}
              onClick={actions[item.key]}
              initial={reduce ? false : { opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: reduce ? 0 : (ITEMS.length - i) * 0.03, type: "spring", stiffness: 420, damping: 30 }}
              className="glass-strong flex items-center gap-3.5 rounded-[20px] p-3 text-left text-ink"
            >
              <span className={`flex h-[52px] w-[52px] flex-none items-center justify-center rounded-tile ${item.tile}`}>
                {item.icon}
              </span>
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-[17px] font-extrabold">{item.title}</span>
                <span className="text-[13px] text-muted">{item.sub}</span>
              </span>
              <ChevronRightIcon size={18} className="text-muted" />
            </motion.button>
          ))}
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="flex h-[62px] w-[62px] items-center justify-center rounded-full bg-ink text-pink shadow-[0_6px_20px_rgba(46,26,36,0.25)]"
            >
              <CloseIcon size={24} strokeWidth={2.4} />
            </button>
          </div>
        </div>
      </div>
    </Overlay>
  )
}
