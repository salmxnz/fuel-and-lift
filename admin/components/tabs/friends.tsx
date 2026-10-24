"use client"

import Link from "next/link"
import { Empty, Failed, LoadingCards } from "@/components/states"
import { UserAvatar } from "@/components/user-avatar"
import { useUserTab } from "@/lib/api/hooks"
import type { FriendsResponse } from "@/lib/api/types"
import { formatDate } from "@/lib/format"

export function FriendsTab({ id }: { id: string }) {
  const { data, error, isPending } = useUserTab<FriendsResponse>(id, "friends")
  if (error) return <Failed error={error} />
  if (isPending) return <LoadingCards count={2} />
  if (data.friends.length === 0) return <Empty title="No friends yet" />

  return (
    <ul className="divide-y rounded-xl border">
      {data.friends.map((f) => (
        <li key={f.id}>
          <Link href={`/users/${f.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
            <UserAvatar name={f.name} src={f.avatar_url} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{f.name}</div>
              <div className="text-sm text-muted-foreground">Friends since {formatDate(f.since)}</div>
            </div>
            <div className="text-right text-sm text-muted-foreground">
              {f.last_workout_on ? `Last workout ${formatDate(f.last_workout_on)}` : "No shared workouts"}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
