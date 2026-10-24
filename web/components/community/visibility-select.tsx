"use client"

import { useId, useState } from "react"
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
