"use client"

import { useState } from "react"
import { VisibilityBadge } from "@/components/badges"
import { HideToggle } from "@/components/hide-toggle"
import { Empty, Failed, LoadingCards } from "@/components/states"
import { Card, CardContent } from "@/components/ui/card"
import { matchesVisibility, VisibilityFilter, type VisibilityChoice } from "@/components/visibility-filter"
import { useUserTab } from "@/lib/api/hooks"
import { WEEKDAYS, type RoutinesResponse } from "@/lib/api/types"
import { formatRelative, plural } from "@/lib/format"
import { cn } from "@/lib/utils"

const DAY: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" }

export function RoutinesTab({ id }: { id: string }) {
  const { data, error, isPending } = useUserTab<RoutinesResponse>(id, "routines")
  const [filter, setFilter] = useState<VisibilityChoice>("all")
  if (error) return <Failed error={error} />
  if (isPending) return <LoadingCards />
  const list = data.routines.filter((r) => matchesVisibility(r, filter))

  return (
    <div className="flex flex-col gap-4">
      <VisibilityFilter items={data.routines} value={filter} onChange={setFilter} />
      {data.routines.length === 0 ? <Empty title="No routines" /> : null}
      {data.routines.length > 0 && list.length === 0 ? <Empty title="Nothing here with that filter" /> : null}
      <div className="grid gap-3">
        {list.map((r) => (
          <Card key={r.id} className="gap-3 py-4">
            <CardContent className="flex flex-col gap-3 px-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-medium">{r.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {r.preset ? `From the ${r.preset} split · ` : ""}updated {formatRelative(r.updated_at)}
                    {r.copied_from ? ` · copied from ${r.copied_from.name}` : ""}
                  </p>
                  {r.description ? <p className="mt-1 text-sm">{r.description}</p> : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {r.visibility === "public" ? <span className="text-xs text-muted-foreground">{plural(r.add_count, "add")}</span> : null}
                  <VisibilityBadge visibility={r.visibility} hidden={r.hidden} />
                  <HideToggle userId={id} kind="routine" id={r.id} visibility={r.visibility} hidden={r.hidden} />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
                {WEEKDAYS.map((d) => {
                  const day = r.days[d]
                  return (
                    <div
                      key={d}
                      className={cn("flex min-h-16 flex-col gap-1 rounded-lg border p-2 text-xs", day ? "bg-muted/50" : "border-dashed")}
                    >
                      <span className="font-medium text-muted-foreground">{DAY[d]}</span>
                      <span className={cn("line-clamp-2", day ? "font-medium" : "text-muted-foreground")}>{day ? day.name : "Rest"}</span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
