"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { PlanBadge, RoleBadge, SuspendedBadge } from "@/components/badges"
import { Failed } from "@/components/states"
import { TabNav } from "@/components/tab-nav"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { UserAvatar } from "@/components/user-avatar"
import { UserActions } from "@/components/user/user-actions"
import { useAdminUser } from "@/lib/api/hooks"
import { formatDate, formatRelative } from "@/lib/format"

export function UserHeader({ id }: { id: string }) {
  const { data, error, isPending } = useAdminUser(id)
  const base = `/users/${id}`

  return (
    <div className="flex flex-col gap-5">
      <Link href="/users" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Users
      </Link>

      {error ? <Failed error={error} /> : null}
      {isPending ? (
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
      ) : null}

      {data ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <UserAvatar name={data.user.display_name ?? (data.user.name || data.user.email)} src={data.user.avatar_url} className="size-16 text-base" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{data.user.display_name ?? (data.user.name || data.user.email)}</h1>
              <PlanBadge user={data.user} />
              <RoleBadge role={data.user.role} />
              <SuspendedBadge at={data.user.suspended_at} />
              {data.user.admin_email ? <Badge variant="outline">ADMIN_EMAILS</Badge> : null}
              {!data.user.onboarded ? <Badge variant="outline">Not onboarded</Badge> : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {data.user.email}
              {data.user.display_name && data.user.name && data.user.name !== data.user.display_name ? ` · Google name “${data.user.name}”` : ""}
            </p>
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>Joined {formatDate(data.user.created_at)}</span>
              <span>Last sign-in {formatRelative(data.user.last_login_at)}</span>
              {data.user.invited_by ? (
                <span>
                  Invited by{" "}
                  <Link href={`/users/${data.user.invited_by.id}`} className="font-medium text-foreground hover:underline">
                    {data.user.invited_by.name || "someone"}
                  </Link>
                </span>
              ) : null}
            </p>
            {data.user.suspended_at ? (
              <div className="mt-1 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                Suspended {formatDate(data.user.suspended_at)}
                {data.user.suspended_reason ? `: ${data.user.suspended_reason}` : ". No reason given."}
              </div>
            ) : null}
          </div>
          <UserActions user={data.user} />
        </div>
      ) : null}

      <TabNav
        tabs={[
          { href: base, label: "Overview", exact: true },
          { href: `${base}/meals`, label: "Meals", count: data?.user.counts.saved_meals },
          { href: `${base}/workouts`, label: "Workouts", count: data?.user.counts.templates },
          { href: `${base}/routines`, label: "Routines", count: data?.user.counts.routines },
          { href: `${base}/sessions`, label: "Sessions", count: data?.user.counts.sessions_finished },
          { href: `${base}/friends`, label: "Friends", count: data?.user.counts.friends },
          { href: `${base}/notifications`, label: "Notifications" },
          { href: `${base}/activity`, label: "Activity" },
        ]}
      />
    </div>
  )
}
