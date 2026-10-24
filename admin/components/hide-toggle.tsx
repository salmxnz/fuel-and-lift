"use client"

import { Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useHide } from "@/lib/api/hooks"
import type { ShopKind, Visibility } from "@/lib/api/types"

/**
 * Hide an item from the Shop, profiles and adds (the owner keeps it and gets a
 * push), or show it again. Private items aren't seen by anyone else, so there
 * is nothing to hide until they're shared.
 */
export function HideToggle({
  userId,
  kind,
  id,
  visibility,
  hidden,
}: {
  userId: string
  kind: ShopKind
  id: string
  visibility: Visibility
  hidden: boolean
}) {
  const hide = useHide(userId)
  if (visibility === "private" && !hidden) return null
  return (
    <Button
      variant={hidden ? "outline" : "ghost"}
      size="sm"
      disabled={hide.isPending}
      onClick={() => hide.mutate({ kind, id, hide: !hidden })}
    >
      {hidden ? <Eye /> : <EyeOff />}
      {hidden ? "Unhide" : "Hide"}
    </Button>
  )
}
