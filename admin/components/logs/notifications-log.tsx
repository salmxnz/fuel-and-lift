"use client"

import { Fragment, useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Bell, ChevronDown, Mail } from "lucide-react"
import { Details, LiveToggle, PersonCell, SearchInput, TimeCell, useFilterState } from "@/components/logs/shared"
import { Segmented } from "@/components/segmented"
import { Empty, Failed, LoadingCards } from "@/components/states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { UserFilterChip } from "@/components/user-filter-chip"
import { api } from "@/lib/api/client"
import { useLogPages } from "@/lib/api/hooks"
import {
  NOTIFICATION_STATUSES,
  type NotificationStats,
  type NotificationStatus,
  type NotificationsResponse,
  type SentNotification,
} from "@/lib/api/types"
import { cn } from "@/lib/utils"

const STATUS: Record<NotificationStatus, { label: string; className: string }> = {
  sent: { label: "Sent", className: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" },
  partial: { label: "Partly sent", className: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  quiet_hours: { label: "Quiet hours", className: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  no_devices: { label: "No devices", className: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  failed: { label: "Failed", className: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200" },
  disabled: { label: "Off on server", className: "text-muted-foreground" },
}

function StatusBadge({ status }: { status: NotificationStatus }) {
  const s = STATUS[status]
  return (
    <Badge variant="outline" className={s.className}>
      {s.label}
    </Badge>
  )
}

const KEYS = ["channel", "status", "kind", "q", "user_id"] as const

/**
 * Every push and email the server tried to send. With userId, fixed to that
 * person (a tab on their page, filters kept locally); without, the global
 * page with its filters in the URL.
 */
export function NotificationsLog({ userId }: { userId?: string }) {
  const [f, setF] = useFilterState(KEYS, !userId)
  const [live, setLive] = useState(false)
  const [open, setOpen] = useState<number | null>(null)
  const filters: Record<string, string> = { channel: f.channel, status: f.status, kind: f.kind, q: f.q, user_id: userId ?? f.user_id }
  const { data, error, isPending, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage } = useLogPages<NotificationsResponse>(
    "admin/notifications",
    filters,
    live
  )
  const rows = data?.pages.flatMap((p) => p.notifications) ?? []

  return (
    <div className="flex flex-col gap-4">
      {!userId ? <StatCards live={live} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Channel"
          value={f.channel || "all"}
          options={[
            { value: "all", label: "All" },
            { value: "push", label: "Push" },
            { value: "email", label: "Email" },
          ]}
          onChange={(v) => setF({ channel: v === "all" ? "" : v })}
        />
        <Select value={f.status || "all"} onValueChange={(v) => setF({ status: v === "all" ? "" : v })}>
          <SelectTrigger className="w-40" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            {NOTIFICATION_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <SearchInput value={f.kind} onChange={(v) => setF({ kind: v })} placeholder="Kind (e.g. welcome)" className="max-w-52" />
        <SearchInput value={f.q} onChange={(v) => setF({ q: v })} placeholder="Search title, body or address" />
        {!userId && f.user_id ? <UserFilterChip id={f.user_id} onClear={() => setF({ user_id: "" })} /> : null}
        <div className="ml-auto flex items-center gap-2">
          {userId ? (
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/notifications?user_id=${userId}`}>Open in full log</Link>
            </Button>
          ) : null}
          <LiveToggle live={live} onChange={setLive} fetching={isFetching} />
        </div>
      </div>

      {error ? <Failed error={error} /> : null}
      {isPending ? <LoadingCards /> : null}
      {data && rows.length === 0 ? <Empty title="Nothing sent yet">Pushes and emails show up here as they go out.</Empty> : null}

      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Time</TableHead>
                <TableHead className="w-8" />
                {!userId ? <TableHead>To</TableHead> : null}
                <TableHead>Kind</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="pr-4">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((n) => (
                <Fragment key={n.id}>
                  <TableRow className="cursor-pointer" onClick={() => setOpen(open === n.id ? null : n.id)} aria-expanded={open === n.id}>
                    <TableCell className="pl-4">
                      <span className="flex items-center gap-2">
                        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open === n.id ? "" : "-rotate-90")} />
                        <TimeCell iso={n.created_at} />
                      </span>
                    </TableCell>
                    <TableCell>
                      {n.channel === "push" ? (
                        <Bell className="size-4 text-muted-foreground" aria-label="Push" />
                      ) : (
                        <Mail className="size-4 text-muted-foreground" aria-label="Email" />
                      )}
                    </TableCell>
                    {!userId ? (
                      <TableCell>
                        <PersonCell person={n.user} fallback={n.recipient ?? "—"} />
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{n.kind}</code>
                    </TableCell>
                    <TableCell className="max-w-80 truncate">{n.title}</TableCell>
                    <TableCell className="pr-4">
                      <StatusBadge status={n.status} />
                    </TableCell>
                  </TableRow>
                  {open === n.id ? (
                    <TableRow className="bg-muted/20 hover:bg-muted/20">
                      <TableCell colSpan={userId ? 5 : 6} className="px-4 py-3 pl-10 whitespace-normal">
                        <NotificationDetails n={n} />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {hasNextPage ? (
        <Button variant="outline" className="self-center" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
          {isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      ) : null}
    </div>
  )
}

function NotificationDetails({ n }: { n: SentNotification }) {
  return (
    <Details
      rows={[
        [n.channel === "email" ? "Subject" : "Title", n.title],
        ["Body", n.body],
        ["Opens", n.url ? <code className="text-xs">{n.url}</code> : null],
        ["To", n.recipient],
        ["Devices", n.channel === "push" && n.devices > 0 ? `${n.delivered} of ${n.devices} delivered` : null],
        ["Error", n.error ? <span className="text-destructive">{n.error}</span> : null],
      ]}
    />
  )
}

/** The last 24 hours at a glance. */
function StatCards({ live }: { live: boolean }) {
  const { data } = useQuery({
    queryKey: ["logs", "notification-stats"],
    queryFn: () => api.get<NotificationStats>("admin/notifications/stats"),
    refetchInterval: live ? 5000 : false,
  })
  const push = data?.counts.push
  const mail = data?.counts.email
  const cards = [
    { label: "Pushes sent", value: push ? push.sent + push.partial : null },
    { label: "Pushes skipped", value: push ? push.quiet_hours + push.no_devices + push.disabled : null, hint: "quiet hours, no devices, off" },
    { label: "Pushes failed", value: push?.failed ?? null, bad: true },
    { label: "Emails sent", value: mail ? mail.sent : null },
    { label: "Emails failed", value: mail?.failed ?? null, bad: true },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => (
        <Card key={c.label} className="gap-1 py-3">
          <CardContent className="px-4">
            <div className="text-xs text-muted-foreground">{c.label} · 24 h</div>
            <div className={cn("text-2xl font-semibold tabular-nums", c.bad && c.value ? "text-destructive" : "")}>{c.value ?? "–"}</div>
            {c.hint ? <div className="text-[11px] text-muted-foreground">{c.hint}</div> : null}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
