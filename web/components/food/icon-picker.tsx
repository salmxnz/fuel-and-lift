"use client"

import { useState } from "react"
import { Sheet } from "@/components/ui/sheet"
import { TextInput } from "@/components/ui/primitives"
import { cn } from "@/lib/cn"
import { FOOD_ICONS, FOOD_ICON_GROUPS, foodIcon } from "@/lib/food-icons"
import { FoodIconTile } from "./food-icon"

/** Pick a meal's picture from the food icons, or none. */
export function IconPickerSheet({
  open,
  value,
  onClose,
  onPick,
}: {
  open: boolean
  /** The current icon key, or null. */
  value: string | null
  onClose: () => void
  /** A key, or null for no picture. */
  onPick: (key: string | null) => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Pick a picture">
      {open ? <IconGrid value={value} onPick={onPick} /> : null}
    </Sheet>
  )
}

function IconGrid({ value, onPick }: { value: string | null; onPick: (key: string | null) => void }) {
  const [q, setQ] = useState("")
  const query = q.trim().toLowerCase()
  const matches = (i: (typeof FOOD_ICONS)[number]) =>
    !query || i.label.toLowerCase().includes(query) || i.words.some((w) => w.includes(query))

  return (
    <div className="flex flex-col gap-3">
      <TextInput
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search: rice, coffee, cake…"
        aria-label="Search pictures"
      />
      {FOOD_ICON_GROUPS.map((group) => {
        const icons = FOOD_ICONS.filter((i) => i.group === group && matches(i))
        if (icons.length === 0) return null
        return (
          <section key={group} aria-label={group} className="flex flex-col gap-1.5">
            <h3 className="m-0 text-[13px] font-semibold text-muted">{group}</h3>
            <div className="grid grid-cols-4 gap-1.5">
              {icons.map((i) => (
                <IconButton key={i.key} label={i.label} selected={value === i.key} onClick={() => onPick(i.key)}>
                  <FoodIconTile icon={i.key} size={52} />
                </IconButton>
              ))}
            </div>
          </section>
        )
      })}
      {!query && foodIcon(value) ? (
        <button
          type="button"
          onClick={() => onPick(null)}
          className="min-h-[44px] self-center text-[14px] font-semibold text-muted transition-transform duration-[160ms] ease-out active:scale-[0.97]"
        >
          No picture
        </button>
      ) : null}
      {query && !FOOD_ICONS.some(matches) ? <p className="m-0 text-[14px] text-muted">No picture for “{q.trim()}”.</p> : null}
    </div>
  )
}

function IconButton({
  label,
  selected,
  onClick,
  children,
}: {
  label: string
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 rounded-tile border-2 py-1.5 transition-transform duration-[160ms] ease-out active:scale-[0.97]",
        selected ? "border-ink bg-white" : "border-transparent"
      )}
    >
      {children}
      <span className={cn("max-w-full truncate px-1 text-[12px]", selected ? "font-bold" : "text-ink-soft")}>{label}</span>
    </button>
  )
}

/** The tile you tap to change a meal's picture: shows it, or a dashed "+". */
export function IconChooser({
  icon,
  onClick,
  size = 56,
}: {
  icon: string | null
  onClick: () => void
  size?: number
}) {
  const known = foodIcon(icon)
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={known ? `Picture: ${known.label}. Change` : "Add a picture"}
      className="flex flex-none flex-col items-center gap-1 transition-transform duration-[160ms] ease-out active:scale-[0.97]"
    >
      {known ? (
        <FoodIconTile icon={known.key} size={size} />
      ) : (
        <span
          aria-hidden="true"
          className="flex items-center justify-center rounded-[12px] border-[1.5px] border-dashed border-dash text-[22px] text-muted"
          style={{ width: size, height: size }}
        >
          +
        </span>
      )}
      <span className="text-[12px] font-semibold text-protein">{known ? "Change" : "Picture"}</span>
    </button>
  )
}

/**
 * A meal's picture while logging it: follows fallback (the AI's choice or a
 * guess from the name) until someone picks one. Render `sheet` once.
 */
export function useIconChoice(fallback: string | null) {
  const [picked, setPicked] = useState<string | null | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const icon = picked === undefined ? fallback : picked
  const sheet = (
    <IconPickerSheet
      open={open}
      value={icon}
      onClose={() => setOpen(false)}
      onPick={(key) => {
        setPicked(key)
        setOpen(false)
      }}
    />
  )
  return { icon, openPicker: () => setOpen(true), sheet }
}
