"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Sheet } from "@/components/ui/sheet"
import { Button, Skeleton, Switch } from "@/components/ui/primitives"
import { CheckIcon } from "@/components/ui/icons"
import { api, errorMessage, seg } from "@/lib/api/client"
import type { ApplySplitResponse, Split, SplitsResponse, Weekday } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { cn } from "@/lib/cn"
import { WEEKDAY_KEYS } from "@/lib/dates"
import { assignDays, dayRange } from "@/lib/splits"

const DAY_LABEL: Record<Weekday, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" }

/** Pick a preset split and days: new workouts, a routine, and (optionally) the week. */
export function SplitSheet({
  open,
  onClose,
  onApplied,
  initialKey,
}: {
  open: boolean
  onClose: () => void
  onApplied: (res: ApplySplitResponse) => void
  /** Preselect this split (from the Shop's starter picks). */
  initialKey?: string
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Start from a split" description="New workouts for each day, saved as a routine you can edit or share.">
      {open ? <SplitForm onApplied={onApplied} initialKey={initialKey} /> : null}
    </Sheet>
  )
}

function SplitForm({ onApplied, initialKey }: { onApplied: (res: ApplySplitResponse) => void; initialKey?: string }) {
  const res = useApi<SplitsResponse>("splits")
  const [picked, setSplit] = useState<Split | null>(null)
  const [pickedDays, setDays] = useState<Weekday[] | null>(null)
  // The preselected split until something else is picked.
  const initial = initialKey ? (res.data?.splits.find((x) => x.key === initialKey) ?? null) : null
  const split = picked ?? initial
  const days = pickedDays ?? (picked ? [] : initial ? [...initial.default_days] : [])
  const [applyToWeek, setApplyToWeek] = useState(true)
  const [busy, setBusy] = useState(false)

  if (res.loading) {
    return (
      <div className="flex flex-col gap-2" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[64px] rounded-tile" />
        ))}
      </div>
    )
  }
  if (res.error) {
    return (
      <div role="alert" className="flex items-center justify-between gap-3 rounded-tile bg-white p-3.5 text-[14px] text-muted">
        Couldn&apos;t load the splits.
        <Button size="sm" variant="outline" onClick={() => void res.reload()}>
          Try again
        </Button>
      </div>
    )
  }

  const fits = !!split && days.length >= split.min_days && days.length <= split.max_days
  const plan = split ? assignDays(split, days) : {}

  async function apply() {
    if (!split || !fits) return
    setBusy(true)
    try {
      const out = await api.post<ApplySplitResponse>(`splits/${seg(split.key)}/apply`, { days, apply_to_week: applyToWeek })
      toast.success(applyToWeek ? `${split.name} is your week now` : `${split.name} saved to your routines`)
      onApplied(out)
    } catch (err) {
      toast.error(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Split" className="flex flex-col gap-1.5">
        {(res.data?.splits ?? []).map((sp) => {
          const on = split?.key === sp.key
          return (
            <button
              key={sp.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                setSplit(sp)
                setDays([...sp.default_days])
              }}
              className={cn(
                "flex min-h-[60px] items-center justify-between gap-3 rounded-tile border-2 px-3.5 py-2.5 text-left transition-transform duration-[160ms] ease-out active:scale-[0.98]",
                on ? "border-ink bg-pink" : "border-transparent bg-white"
              )}
            >
              <span className="flex flex-col">
                <span className="text-[16px] font-bold">{sp.name}</span>
                <span className={cn("text-[13px]", !on && "text-muted")}>
                  {dayRange(sp)} · {sp.workouts.map((w) => w.name).join(", ")}
                </span>
              </span>
              {on ? <CheckIcon size={20} /> : null}
            </button>
          )
        })}
      </div>

      {split ? (
        <>
          <div className="flex flex-col gap-2">
            <span id="split-days" className="text-[13px] font-semibold text-muted">
              Training days ({dayRange(split)})
            </span>
            <div role="group" aria-labelledby="split-days" className="grid grid-cols-7 gap-1.5">
              {WEEKDAY_KEYS.map((d) => {
                const on = days.includes(d)
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])}
                    className={cn(
                      "flex min-h-12 items-center justify-center rounded-[12px] text-[12px] font-bold",
                      on ? "border-2 border-ink bg-pink" : "border-2 border-transparent bg-white text-muted"
                    )}
                  >
                    {DAY_LABEL[d]}
                  </button>
                )
              })}
            </div>
            {days.length > 0 ? (
              <p className="m-0 text-[13px] text-muted">
                {WEEKDAY_KEYS.filter((d) => plan[d])
                  .map((d) => `${DAY_LABEL[d]} · ${plan[d]}`)
                  .join(", ")}
              </p>
            ) : null}
            {!fits ? (
              <p role="status" className="m-0 text-[13px] font-semibold text-danger">
                Pick {dayRange(split)}.
              </p>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-3 rounded-tile bg-white p-3.5">
            <span id="split-apply" className="text-[14px]">
              <span className="font-semibold">Make it my week</span>
              <span className="block text-[12px] text-muted">Replaces the workouts on your week</span>
            </span>
            <Switch checked={applyToWeek} onChange={setApplyToWeek} labelledBy="split-apply" />
          </div>
          <Button onClick={apply} loading={busy} disabled={!fits}>
            Create {split.name}
          </Button>
        </>
      ) : null}
    </div>
  )
}
