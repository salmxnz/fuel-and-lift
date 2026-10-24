"use client"

import { useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { VisibilityBadge } from "@/components/badges"
import { HideToggle } from "@/components/hide-toggle"
import { Segmented } from "@/components/segmented"
import { Empty, Failed, LoadingCards } from "@/components/states"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { matchesVisibility, VisibilityFilter, type VisibilityChoice } from "@/components/visibility-filter"
import { useUserTab } from "@/lib/api/hooks"
import type { EntriesResponse, Entry, Macros, SavedMealsResponse } from "@/lib/api/types"
import { addDays, formatDay, formatRelative, formatTime, kcal, plural, toDay } from "@/lib/format"

export function MealsTab({ id }: { id: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const view = params.get("view") === "diary" ? "diary" : "saved"
  return (
    <div className="flex flex-col gap-4">
      <Segmented
        label="Meals view"
        value={view}
        options={[
          { value: "saved", label: "Saved meals" },
          { value: "diary", label: "Diary" },
        ]}
        onChange={(v) => router.replace(v === "diary" ? "?view=diary" : "?", { scroll: false })}
      />
      {view === "saved" ? <SavedMeals id={id} /> : <Diary id={id} />}
    </div>
  )
}

function MacroLine({ m }: { m: Macros }) {
  return (
    <span className="text-muted-foreground">
      {kcal(m.kcal)} · P {Math.round(m.protein_g)} · C {Math.round(m.carbs_g)} · F {Math.round(m.fat_g)}
    </span>
  )
}

function SavedMeals({ id }: { id: string }) {
  const { data, error, isPending } = useUserTab<SavedMealsResponse>(id, "saved-meals")
  const [filter, setFilter] = useState<VisibilityChoice>("all")
  if (error) return <Failed error={error} />
  if (isPending) return <LoadingCards />
  const meals = data.saved_meals.filter((m) => matchesVisibility(m, filter))

  return (
    <div className="flex flex-col gap-4">
      <VisibilityFilter items={data.saved_meals} value={filter} onChange={setFilter} />
      {data.saved_meals.length === 0 ? <Empty title="No saved meals" /> : null}
      {data.saved_meals.length > 0 && meals.length === 0 ? <Empty title="Nothing here with that filter" /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {meals.map((m) => (
          <Card key={m.id} className="gap-3 py-4">
            <CardContent className="flex flex-col gap-3 px-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-medium">{m.name}</h3>
                  <p className="text-sm">
                    <MacroLine m={m.base} />
                  </p>
                </div>
                <HideToggle userId={id} kind="meal" id={m.id} visibility={m.visibility} hidden={m.hidden} />
              </div>
              <ul className="flex flex-col gap-1 text-sm">
                {m.items.map((i) => (
                  <li key={i.id} className="flex justify-between gap-3">
                    <span className="truncate">
                      {i.is_addon ? <span className="text-muted-foreground">+ </span> : null}
                      {i.name}
                      {i.grams ? <span className="text-muted-foreground"> · {Math.round(i.grams)} g</span> : null}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{kcal(i.kcal)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <VisibilityBadge visibility={m.visibility} hidden={m.hidden} />
                {m.visibility === "public" ? <span>{plural(m.add_count, "add")}</span> : null}
                <span>Last used {formatRelative(m.last_used_at)}</span>
                {m.copied_from ? <span>From {m.copied_from.name}</span> : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

const WINDOW = 14
const MAX_DAYS = 91

function sum(entries: Entry[]): Macros {
  return entries.reduce(
    (t, e) => ({ kcal: t.kcal + e.kcal, protein_g: t.protein_g + e.protein_g, carbs_g: t.carbs_g + e.carbs_g, fat_g: t.fat_g + e.fat_g }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  )
}

function Diary({ id }: { id: string }) {
  // The user's own "today" may be ahead of ours, so ask up to tomorrow. Load
  // earlier widens the range 14 days at a time, up to the API's 92-day limit
  // (91 days back plus tomorrow).
  const [days, setDays] = useState(WINDOW)
  const range = useMemo(() => {
    const today = new Date()
    return { from: toDay(addDays(today, -(days - 1))), to: toDay(addDays(today, 1)) }
  }, [days])
  const { data, error, isPending, isFetching } = useUserTab<EntriesResponse>(id, "entries", range)

  const byDay = useMemo(() => {
    const out: { day: string; entries: Entry[] }[] = []
    for (const e of data?.entries ?? []) {
      const last = out[out.length - 1]
      if (last?.day === e.date) last.entries.push(e)
      else out.push({ day: e.date, entries: [e] })
    }
    return out
  }, [data])

  if (error) return <Failed error={error} />
  if (isPending) return <LoadingCards />

  return (
    <div className="flex flex-col gap-4">
      {byDay.length === 0 ? <Empty title={`Nothing logged in the last ${days} days`} /> : null}
      {byDay.map(({ day, entries }) => {
        const meals = new Map<string, Entry[]>()
        for (const e of entries) meals.set(e.meal_name, [...(meals.get(e.meal_name) ?? []), e])
        return (
          <Card key={day} className="gap-3 py-4">
            <CardContent className="flex flex-col gap-3 px-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium">{formatDay(day)}</h3>
                <span className="text-sm">
                  <MacroLine m={sum(entries)} />
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {[...meals].map(([meal, es]) => (
                  <div key={meal} className="flex flex-col gap-1">
                    <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{meal}</div>
                    {es.map((e) => (
                      <div key={e.id} className="flex justify-between gap-3 text-sm">
                        <span className="truncate">
                          {e.name}
                          <span className="text-muted-foreground">
                            {" "}
                            · {e.origin} · {formatTime(e.logged_at)}
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">{kcal(e.kcal)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )
      })}
      {days < MAX_DAYS ? (
        <Button variant="outline" className="self-center" disabled={isFetching} onClick={() => setDays((d) => Math.min(MAX_DAYS, d + WINDOW))}>
          {isFetching ? "Loading…" : "Load earlier"}
        </Button>
      ) : (
        <p className="text-center text-sm text-muted-foreground">Showing the last {MAX_DAYS} days.</p>
      )}
    </div>
  )
}
