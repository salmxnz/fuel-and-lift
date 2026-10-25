"use client"

import { Fragment, useState } from "react"
import Link from "next/link"
import { ChevronDown } from "lucide-react"
import { Details, LiveToggle, PersonCell, SearchInput, TimeCell, useFilterState } from "@/components/logs/shared"
import { Empty, Failed, LoadingCards } from "@/components/states"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { UserFilterChip } from "@/components/user-filter-chip"
import { useLogPages } from "@/lib/api/hooks"
import type { AuditEntry, AuditResponse } from "@/lib/api/types"
import { cn } from "@/lib/utils"

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]
const CLASSES = [
  ["2xx", "2xx success"],
  ["3xx", "3xx redirect"],
  ["4xx", "4xx client error"],
  ["5xx", "5xx server error"],
] as const

function statusClass(s: number): string {
  if (s >= 500) return "text-red-600 dark:text-red-400"
  if (s >= 400) return "text-amber-600 dark:text-amber-400"
  if (s >= 300) return "text-sky-600 dark:text-sky-400"
  return "text-emerald-600 dark:text-emerald-400"
}

const METHOD_STYLE: Record<string, string> = {
  GET: "text-muted-foreground",
  POST: "text-emerald-700 dark:text-emerald-300",
  PUT: "text-sky-700 dark:text-sky-300",
  PATCH: "text-sky-700 dark:text-sky-300",
  DELETE: "text-red-700 dark:text-red-300",
}

const KEYS = ["status", "method", "q", "user_id"] as const

/**
 * Every request the API served. With userId, fixed to that person (the
 * Activity tab); without, the global page with its filters in the URL.
 */
export function AuditLog({ userId }: { userId?: string }) {
  const [f, setF] = useFilterState(KEYS, !userId)
  const [live, setLive] = useState(false)
  const [open, setOpen] = useState<number | null>(null)
  const filters: Record<string, string> = { status: f.status, method: f.method, q: f.q, user_id: userId ?? f.user_id }
  const { data, error, isPending, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage } = useLogPages<AuditResponse>(
    "admin/audit",
    filters,
    live
  )
  const rows = data?.pages.flatMap((p) => p.entries) ?? []
  const cols = userId ? 5 : 6

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={f.status || "all"} onValueChange={(v) => setF({ status: v === "all" ? "" : v })}>
          <SelectTrigger className="w-44" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            {CLASSES.map(([v, label]) => (
              <SelectItem key={v} value={v}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={f.method || "all"} onValueChange={(v) => setF({ method: v === "all" ? "" : v })}>
          <SelectTrigger className="w-32" aria-label="Method">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any method</SelectItem>
            {METHODS.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <SearchInput value={f.q} onChange={(v) => setF({ q: v })} placeholder="Path contains (e.g. /v1/days)" />
        {!userId && f.user_id ? <UserFilterChip id={f.user_id} onClear={() => setF({ user_id: "" })} /> : null}
        <div className="ml-auto flex items-center gap-2">
          {userId ? (
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/audit?user_id=${userId}`}>Open in full log</Link>
            </Button>
          ) : null}
          <LiveToggle live={live} onChange={setLive} fetching={isFetching} />
        </div>
      </div>

      {error ? <Failed error={error} /> : null}
      {isPending ? <LoadingCards /> : null}
      {data && rows.length === 0 ? <Empty title="No requests match" /> : null}

      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Time</TableHead>
                {!userId ? <TableHead>User</TableHead> : null}
                <TableHead>Request</TableHead>
                <TableHead className="text-right">Status</TableHead>
                <TableHead className="text-right">Time taken</TableHead>
                <TableHead className="hidden pr-4 lg:table-cell">IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <Fragment key={a.id}>
                  <TableRow className="cursor-pointer" onClick={() => setOpen(open === a.id ? null : a.id)} aria-expanded={open === a.id}>
                    <TableCell className="pl-4">
                      <span className="flex items-center gap-2">
                        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open === a.id ? "" : "-rotate-90")} />
                        <TimeCell iso={a.at} />
                      </span>
                    </TableCell>
                    {!userId ? (
                      <TableCell>
                        <PersonCell person={a.user} fallback="signed out" />
                      </TableCell>
                    ) : null}
                    <TableCell className="max-w-[28rem]">
                      <span className="flex min-w-0 items-baseline gap-2 font-mono text-xs">
                        <span className={cn("w-12 shrink-0 font-semibold", METHOD_STYLE[a.method])}>{a.method}</span>
                        <span className="truncate">
                          {a.path}
                          {a.query ? <span className="text-muted-foreground">?{a.query}</span> : null}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className={cn("text-right font-mono text-xs font-semibold", statusClass(a.status))}>{a.status}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{a.duration_ms} ms</TableCell>
                    <TableCell className="hidden pr-4 font-mono text-xs text-muted-foreground lg:table-cell">{a.ip ?? "—"}</TableCell>
                  </TableRow>
                  {open === a.id ? (
                    <TableRow className="bg-muted/20 hover:bg-muted/20">
                      <TableCell colSpan={cols} className="px-4 py-3 pl-10 whitespace-normal">
                        <AuditDetails a={a} />
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

function AuditDetails({ a }: { a: AuditEntry }) {
  return (
    <Details
      rows={[
        ["Route", a.route ? <code className="text-xs">{a.route}</code> : "no route matched"],
        ["Query", a.query ? <code className="text-xs break-all">{a.query}</code> : null],
        ["Role", a.role],
        ["Error", a.error ? <span className="text-destructive">{a.error}</span> : null],
        ["IP", a.ip ? <code className="text-xs">{a.ip}</code> : null],
        ["User agent", a.user_agent ? <span className="text-xs text-muted-foreground">{a.user_agent}</span> : null],
      ]}
    />
  )
}
