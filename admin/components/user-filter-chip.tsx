"use client"

import { X } from "lucide-react"
import { UserAvatar } from "@/components/user-avatar"
import { useAdminUser } from "@/lib/api/hooks"

/** The person a log is filtered to, with a button to clear it. */
export function UserFilterChip({ id, onClear }: { id: string; onClear: () => void }) {
  const user = useAdminUser(id).data?.user
  const name = user ? (user.display_name ?? (user.name || user.email)) : "…"
  return (
    <span className="inline-flex h-8 items-center gap-2 rounded-full border bg-background pr-1 pl-1.5 text-sm">
      <UserAvatar name={name} src={user?.avatar_url ?? null} className="size-5" />
      <span className="max-w-40 truncate">{name}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label="Show everyone"
        className="flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </span>
  )
}
