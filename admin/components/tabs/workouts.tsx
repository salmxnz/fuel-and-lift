"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { VisibilityBadge } from "@/components/badges"
import { HideToggle } from "@/components/hide-toggle"
import { Empty, Failed, LoadingCards } from "@/components/states"
import { Card, CardContent } from "@/components/ui/card"
import { matchesVisibility, VisibilityFilter, type VisibilityChoice } from "@/components/visibility-filter"
import { useUserTab } from "@/lib/api/hooks"
import type { Template, TemplatesResponse } from "@/lib/api/types"
import { formatRelative, plural } from "@/lib/format"
import { summarizeCardio, summarizeSets } from "@/lib/sets"
import { cn } from "@/lib/utils"

export function WorkoutsTab({ id }: { id: string }) {
  const { data, error, isPending } = useUserTab<TemplatesResponse>(id, "templates")
  const [filter, setFilter] = useState<VisibilityChoice>("all")
  if (error) return <Failed error={error} />
  if (isPending) return <LoadingCards />
  const list = data.templates.filter((t) => matchesVisibility(t, filter))

  return (
    <div className="flex flex-col gap-4">
      <VisibilityFilter items={data.templates} value={filter} onChange={setFilter} />
      {data.templates.length === 0 ? <Empty title="No workouts" /> : null}
      {data.templates.length > 0 && list.length === 0 ? <Empty title="Nothing here with that filter" /> : null}
      <div className="grid gap-3">
        {list.map((t) => (
          <WorkoutCard key={t.id} userId={id} t={t} />
        ))}
      </div>
    </div>
  )
}

function WorkoutCard({ userId, t }: { userId: string; t: Template }) {
  const [open, setOpen] = useState(false)
  return (
    <Card className="gap-0 py-0">
      <CardContent className="px-0">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open ? "" : "-rotate-90")} />
            <div className="min-w-0">
              <h3 className="truncate font-medium">{t.name}</h3>
              <p className="truncate text-sm text-muted-foreground">
                {plural(t.blocks.length, "exercise")} · v{t.current_version} · updated {formatRelative(t.updated_at)}
              </p>
            </div>
          </button>
          <div className="flex shrink-0 items-center gap-2">
            {t.visibility === "public" ? <span className="text-xs text-muted-foreground">{plural(t.add_count, "add")}</span> : null}
            <VisibilityBadge visibility={t.visibility} hidden={t.hidden} />
            <HideToggle userId={userId} kind="template" id={t.id} visibility={t.visibility} hidden={t.hidden} />
          </div>
        </div>
        {open ? (
          <ol className="divide-y border-t">
            {t.blocks.map((b, i) => (
              <li key={b.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 py-2 pl-11 text-sm">
                <span>
                  <span className="text-muted-foreground">{i + 1}. </span>
                  {b.exercise.name}
                  {b.exercise.muscle_group ? <span className="text-muted-foreground"> · {b.exercise.muscle_group}</span> : null}
                </span>
                <span className="text-muted-foreground">
                  {b.cardio ? summarizeCardio(b.cardio) : summarizeSets(b.sets)}
                  {b.rest_seconds ? ` · rest ${b.rest_seconds}s` : ""}
                </span>
                {b.notes ? <span className="w-full text-xs text-muted-foreground italic">{b.notes}</span> : null}
              </li>
            ))}
            {t.blocks.length === 0 ? <li className="px-4 py-2 pl-11 text-sm text-muted-foreground">No exercises.</li> : null}
          </ol>
        ) : null}
        {t.copied_from ? <p className="border-t px-4 py-2 pl-11 text-xs text-muted-foreground">Copied from {t.copied_from.name}</p> : null}
      </CardContent>
    </Card>
  )
}
