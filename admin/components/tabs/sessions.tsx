"use client"

import { Fragment, useMemo, useState } from "react"
import { ChevronDown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Empty, Failed, LoadingCards } from "@/components/states"
import { useUserTab } from "@/lib/api/hooks"
import type { Session, SessionsResponse } from "@/lib/api/types"
import { addDays, formatDay, formatDuration, toDay } from "@/lib/format"
import { summarizeCardio } from "@/lib/sets"
import { cn } from "@/lib/utils"

const WINDOW = 90
const MAX_WINDOWS = 8 // the API caps a range at two years

function stats(s: Session) {
  let done = 0
  let total = 0
  let volume = 0
  for (const b of s.blocks) {
    for (const set of b.sets) {
      if (set.warmup) continue
      total++
      if (set.done) {
        done++
        volume += (set.actual_kg ?? 0) * (set.actual_reps ?? 0)
      }
    }
  }
  return { done, total, volume: Math.round(volume) }
}

export function SessionsTab({ id }: { id: string }) {
  // Each "Load earlier" adds another 90 days.
  const [windows, setWindows] = useState(1)
  const range = useMemo(() => {
    const today = new Date()
    return { from: toDay(addDays(today, -(windows * WINDOW - 1))), to: toDay(addDays(today, 14)) }
  }, [windows])
  const { data, error, isPending, isFetching } = useUserTab<SessionsResponse>(id, "sessions", range)
  const [open, setOpen] = useState<string | null>(null)

  if (error) return <Failed error={error} />
  if (isPending) return <LoadingCards />

  return (
    <div className="flex flex-col gap-4">
      {data.sessions.length === 0 ? <Empty title={`No workouts in the last ${windows * WINDOW} days`} /> : null}
      {data.sessions.length > 0 ? (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Date</TableHead>
                <TableHead>Workout</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Sets done</TableHead>
                <TableHead className="hidden pr-4 sm:table-cell">Volume</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.sessions.map((s) => {
                const st = stats(s)
                const expanded = open === s.id
                return (
                  <Fragment key={s.id}>
                    <TableRow className="cursor-pointer" onClick={() => setOpen(expanded ? null : s.id)} aria-expanded={expanded}>
                      <TableCell className="pl-4">
                        <span className="flex items-center gap-2">
                          <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", expanded ? "" : "-rotate-90")} />
                          {formatDay(s.date)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          {s.template_name ?? "Empty session"}
                          {s.template_version ? <span className="text-xs text-muted-foreground">v{s.template_version}</span> : null}
                          {s.status === "active" ? <Badge variant="secondary">In progress</Badge> : null}
                        </span>
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">{formatDuration(s.started_at, s.finished_at)}</TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {st.done}/{st.total}
                      </TableCell>
                      <TableCell className="hidden pr-4 text-muted-foreground sm:table-cell">
                        {st.volume ? `${st.volume.toLocaleString("en-GB")} kg` : "—"}
                      </TableCell>
                    </TableRow>
                    {expanded ? (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={5} className="px-4 py-3 whitespace-normal">
                          <SessionDetail s={s} />
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        </div>
      ) : null}
      {windows < MAX_WINDOWS ? (
        <Button variant="outline" className="self-center" disabled={isFetching} onClick={() => setWindows((w) => w + 1)}>
          {isFetching ? "Loading…" : "Load earlier"}
        </Button>
      ) : null}
    </div>
  )
}

function SessionDetail({ s }: { s: Session }) {
  if (s.blocks.length === 0) return <p className="text-sm text-muted-foreground">No exercises.</p>
  return (
    <ol className="flex flex-col gap-2 pl-6 text-sm">
      {s.blocks.map((b) => (
        <li key={b.id} className="flex flex-col gap-1">
          <span className={cn("font-medium", b.skipped && "text-muted-foreground line-through")}>
            {b.exercise.name}
            {b.skipped ? <span className="ml-2 text-xs font-normal no-underline">skipped</span> : null}
          </span>
          {b.cardio ? (
            <span className="text-muted-foreground">
              {summarizeCardio(b.cardio)} · {b.cardio_done ? "done" : "not done"}
            </span>
          ) : (
            <span className="flex flex-wrap gap-1.5">
              {b.sets.map((set) => (
                <span
                  key={set.id}
                  className={cn(
                    "rounded-md border px-1.5 py-0.5 text-xs tabular-nums",
                    set.done ? "bg-background" : "border-dashed text-muted-foreground",
                    set.warmup && "opacity-70"
                  )}
                  title={set.warmup ? "Warm-up" : undefined}
                >
                  {set.warmup ? "W " : ""}
                  {set.done
                    ? `${set.actual_reps ?? "?"} × ${set.actual_kg ?? 0} kg`
                    : `${set.to_failure ? "AMRAP" : (set.target_reps ?? "?")} × ${set.target_kg ?? "?"} kg`}
                </span>
              ))}
            </span>
          )}
        </li>
      ))}
    </ol>
  )
}
