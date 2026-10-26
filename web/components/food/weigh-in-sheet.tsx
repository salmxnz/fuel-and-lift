"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Sheet } from "@/components/ui/sheet"
import { Button, Chip, Skeleton } from "@/components/ui/primitives"
import { useMe } from "@/components/me-context"
import { api, errorMessage } from "@/lib/api/client"
import { enqueue, isOffline, offlineNow } from "@/lib/offline-queue"
import type { WeighInResponse, WeighInsResponse } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { addDays, formatDayMonth, todayISO } from "@/lib/dates"
import { kgToLb, lbToKg, num1, parseDecimal, round1 } from "@/lib/format"

export function WeighInSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Weigh-in" description="Same time of day works best, e.g. after waking up.">
      {open ? <WeighInForm onDone={onClose} /> : null}
    </Sheet>
  )
}

/** Shared by the + menu sheet and the /weigh-in page. */
export function WeighInForm({ onDone }: { onDone: () => void }) {
  const me = useMe()
  const [unit, setUnit] = useState<"kg" | "lb">(me.profile?.units === "imperial" ? "lb" : "kg")
  const [value, setValue] = useState("")
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recent = useApi<WeighInsResponse>(`weigh-ins?from=${addDays(todayISO(), -60)}&to=${todayISO()}`)
  const last = recent.data?.weigh_ins[0]

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const n = parseDecimal(value)
    if (n == null) {
      setError("Enter your weight")
      return
    }
    const weightKg = round1(unit === "lb" ? lbToKg(n) : n)
    if (weightKg < 25 || weightKg > 350) {
      setError("That doesn't look right. Check the number and unit.")
      return
    }
    setSaving(true)
    setError(null)
    const body = { date, weight_kg: weightKg, note: note.trim() || null }
    const when = date === todayISO() ? "today" : formatDayMonth(date)
    try {
      // Same date replaces, so it's safe to send again later.
      if (offlineNow()) {
        enqueue({ kind: "weighin.put", body })
        toast.success(`${num1(weightKg)} kg saved on this phone for ${when}. It syncs when you're back online.`)
      } else {
        await api.post<WeighInResponse>("weigh-ins", body)
        toast.success(`${num1(weightKg)} kg locked in for ${when}`)
      }
      onDone()
    } catch (err) {
      if (isOffline(err)) {
        enqueue({ kind: "weighin.put", body })
        toast.success(`${num1(weightKg)} kg saved on this phone for ${when}. It syncs when you're back online.`)
        onDone()
        return
      }
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <label htmlFor="weigh-value" className="text-[13px] font-semibold text-muted">
          Weight
        </label>
        <div className="flex items-center gap-2">
          <input
            id="weigh-value"
            data-autofocus
            inputMode="decimal"
            autoComplete="off"
            placeholder={last ? num1(unit === "lb" ? kgToLb(last.weight_kg) : last.weight_kg) : unit === "kg" ? "70.0" : "154"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? "weigh-error" : undefined}
            className="min-h-[64px] w-full min-w-0 flex-1 rounded-btn border border-line bg-white px-4 text-[32px] font-extrabold tracking-[-0.02em]"
          />
          <div role="radiogroup" aria-label="Unit" className="flex rounded-full bg-white p-[3px]">
            {(["kg", "lb"] as const).map((u) => (
              <button
                key={u}
                type="button"
                role="radio"
                aria-checked={unit === u}
                onClick={() => setUnit(u)}
                className={`min-h-[44px] min-w-[48px] rounded-full px-3 text-[14px] ${unit === u ? "bg-ink font-bold text-white" : "text-muted"}`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
        {recent.loading ? (
          <Skeleton className="h-4 w-40" />
        ) : last ? (
          <span className="text-[13px] text-muted">
            Last: {num1(unit === "lb" ? kgToLb(last.weight_kg) : last.weight_kg)} {unit} on {formatDayMonth(last.date)}
          </span>
        ) : (
          <span className="text-[13px] text-muted">Your first weigh-in since setup.</span>
        )}
      </div>

      <div role="radiogroup" aria-label="Day" className="flex flex-wrap gap-1.5">
        <Chip selected={date === todayISO()} onClick={() => setDate(todayISO())}>
          Today
        </Chip>
        <Chip selected={date === addDays(todayISO(), -1)} onClick={() => setDate(addDays(todayISO(), -1))}>
          Yesterday
        </Chip>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="weigh-note" className="text-[13px] font-semibold text-muted">
          Note <span className="font-normal">(optional)</span>
        </label>
        <input
          id="weigh-note"
          value={note}
          maxLength={140}
          onChange={(e) => setNote(e.target.value)}
          placeholder="After a salty dinner"
          className="min-h-[48px] rounded-tile border border-line bg-white px-3.5 text-[15px]"
        />
      </div>

      {error ? (
        <p id="weigh-error" role="alert" className="m-0 text-[14px] font-semibold text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" loading={saving}>
        Save weigh-in
      </Button>
    </form>
  )
}
