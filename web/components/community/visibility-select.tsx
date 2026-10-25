"use client"

import { useEffect, useId, useRef, useState } from "react"
import { toast } from "sonner"
import { ChevronDownIcon, FriendsIcon, GlobeIcon, LockIcon } from "@/components/ui/icons"
import { Spinner } from "@/components/ui/primitives"
import { api, errorMessage } from "@/lib/api/client"
import type { Visibility, VisibilityResponse } from "@/lib/api/types"
import { cn } from "@/lib/cn"

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  private: "Private",
  friends: "Friends only",
  public: "Public",
}

const HELP: Record<Visibility, string> = {
  private: "Only you can see it.",
  friends: "Your friends see it on your profile and in their Shop.",
  public: "Anyone on adebite can find it in the Shop, with your name.",
}

export function VisibilityIcon({ visibility, size = 16, className }: { visibility: Visibility; size?: number; className?: string }) {
  const Icon = visibility === "public" ? GlobeIcon : visibility === "friends" ? FriendsIcon : LockIcon
  return <Icon size={size} className={className} />
}

/** Small "Public" / "Friends only" badge for lists (nothing when private). */
export function VisibilityBadge({ visibility, hidden }: { visibility: Visibility; hidden?: boolean }) {
  if (hidden) {
    return <span className="rounded-full bg-chip px-2 py-0.5 text-[11px] font-bold text-danger">Removed from Shop</span>
  }
  if (visibility === "private") return null
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-chip px-2 py-0.5 text-[11px] font-bold text-ink">
      <VisibilityIcon visibility={visibility} size={12} />
      {VISIBILITY_LABEL[visibility]}
    </span>
  )
}

/**
 * Private | Friends only | Public. A native select so it's a real dropdown
 * everywhere (and on phones, the system picker). When `path` is given the
 * change is saved straight away (PUT {path}); otherwise it's just a field.
 */
export function VisibilitySelect({
  value,
  onChange,
  path,
  hidden,
  note,
  className,
}: {
  value: Visibility
  onChange: (v: Visibility) => void
  /** e.g. "templates/{id}/visibility" to save on change. */
  path?: string
  /** A moderator removed it from the Shop. */
  hidden?: boolean
  /** Extra line under the help text ("…and its workouts"). */
  note?: string
  className?: string
}) {
  const id = useId()
  const [saving, setSaving] = useState(false)

  async function pick(next: Visibility) {
    if (next === value) return
    const prev = value
    onChange(next)
    if (!path) return
    setSaving(true)
    try {
      await api.put<VisibilityResponse>(path, { visibility: next })
    } catch (err) {
      onChange(prev)
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[13px] font-semibold text-muted">
        Who can see it
      </label>
      <div className="relative flex items-center">
        <VisibilityIcon visibility={value} size={18} className="pointer-events-none absolute left-3.5 text-ink" />
        <select
          id={id}
          value={value}
          disabled={saving}
          onChange={(e) => void pick(e.target.value as Visibility)}
          className="min-h-[48px] w-full appearance-none rounded-tile border border-line bg-white pl-10 pr-10 text-[15px] font-semibold text-ink disabled:opacity-60"
        >
          {(Object.keys(VISIBILITY_LABEL) as Visibility[]).map((v) => (
            <option key={v} value={v}>
              {VISIBILITY_LABEL[v]}
            </option>
          ))}
        </select>
        {saving ? (
          <Spinner size={16} className="pointer-events-none absolute right-3.5 text-muted" />
        ) : (
          <ChevronDownIcon size={18} className="pointer-events-none absolute right-3.5 text-muted" />
        )}
      </div>
      <span className="text-[12px] text-muted">
        {HELP[value]}
        {note && value !== "private" ? ` ${note}` : ""}
      </span>
      {hidden ? (
        <span role="status" className="text-[12px] font-semibold text-danger">
          A moderator removed this from the Shop. You still have it; others can&apos;t see it.
        </span>
      ) : null}
    </div>
  )
}

/**
 * The top-right Who-sees-it button: a lock, two people or a globe. Tapping it
 * opens the three choices; picking one saves straight away when `path` is set.
 */
export function VisibilityButton({
  value,
  onChange,
  path,
  hidden,
  note,
  name,
}: {
  value: Visibility
  onChange: (v: Visibility) => void
  path?: string
  hidden?: boolean
  /** Extra line under the friends/public help ("Its workouts are shown with it."). */
  note?: string
  /** What's being shared, for the button's label ("Upper-1"). */
  name?: string
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const menuId = useId()
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener("pointerdown", onDown)
    document.addEventListener("keydown", onKey, true)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      document.removeEventListener("keydown", onKey, true)
    }
  }, [open])

  async function pick(next: Visibility) {
    setOpen(false)
    if (next === value) return
    const prev = value
    onChange(next)
    if (!path) return
    setSaving(true)
    try {
      await api.put<VisibilityResponse>(path, { visibility: next })
      toast.success(next === "private" ? "Just for you now" : next === "friends" ? "Your friends can see it" : "Out in the Shop for everyone")
    } catch (err) {
      onChange(prev)
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div ref={wrap} className="relative flex-none">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Who can see ${name ?? "it"}: ${VISIBILITY_LABEL[value]}`}
        disabled={saving}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "relative flex h-11 w-11 items-center justify-center rounded-[14px] transition-[transform,background-color] duration-150 ease-out active:scale-[0.96] disabled:opacity-60",
          value === "private" ? "bg-white text-ink" : value === "friends" ? "bg-pink text-ink" : "bg-ink text-pink"
        )}
      >
        {saving ? <Spinner size={18} /> : <VisibilityIcon visibility={value} size={20} />}
        {hidden ? <span aria-hidden="true" className="absolute right-1 top-1 h-2 w-2 rounded-full bg-danger" /> : null}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Who can see it"
          className="vis-pop absolute right-0 top-[calc(100%+8px)] z-30 flex w-[min(280px,calc(100vw-32px))] flex-col gap-1 rounded-[18px] bg-white p-1.5 shadow-[0_0_0_1px_rgba(46,26,36,0.06),0_16px_40px_rgba(46,26,36,0.18)]"
        >
          {(Object.keys(VISIBILITY_LABEL) as Visibility[]).map((v) => (
            <button
              key={v}
              type="button"
              role="menuitemradio"
              aria-checked={v === value}
              onClick={() => void pick(v)}
              className={cn(
                "flex items-start gap-3 rounded-[14px] p-2.5 text-left transition-colors duration-150",
                v === value ? "bg-pink-soft" : "hover:bg-field"
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 flex-none items-center justify-center rounded-[11px]",
                  v === "private" ? "bg-chip text-ink" : v === "friends" ? "bg-pink text-ink" : "bg-ink text-pink"
                )}
              >
                <VisibilityIcon visibility={v} size={18} />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[15px] font-bold text-ink">{VISIBILITY_LABEL[v]}</span>
                <span className="text-[12.5px] leading-[1.35] text-muted">
                  {HELP[v]}
                  {note && v !== "private" ? ` ${note}` : ""}
                </span>
              </span>
            </button>
          ))}
          {hidden ? (
            <p role="status" className="m-0 px-2.5 pb-1.5 text-[12px] font-semibold text-danger">
              A moderator removed this from the Shop. You still have it; others can&apos;t see it.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
