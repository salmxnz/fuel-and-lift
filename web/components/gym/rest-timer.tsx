"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { ClockIcon } from "@/components/ui/icons"

/** Countdown that starts when a set is ticked; vibrates when rest is over. */
export function useRestTimer() {
  const [endAt, setEndAt] = useState<number | null>(null)
  const [total, setTotal] = useState(0)
  const [now, setNow] = useState(0)

  useEffect(() => {
    if (endAt == null) return
    const tick = () => {
      const t = Date.now()
      if (t >= endAt) {
        setEndAt(null)
        try {
          navigator.vibrate?.([220, 100, 220])
        } catch {
          /* not supported (iOS) */
        }
        toast("Rest over. Next set!", { duration: 2500 })
        return
      }
      setNow(t)
    }
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [endAt])

  const start = useCallback((seconds: number) => {
    const s = Math.max(5, Math.min(600, Math.round(seconds)))
    const t = Date.now()
    setTotal(s)
    setNow(t)
    setEndAt(t + s * 1000)
  }, [])
  const add = useCallback((seconds: number) => {
    setEndAt((e) => (e == null ? e : e + seconds * 1000))
    setTotal((t) => t + seconds)
  }, [])
  const stop = useCallback(() => setEndAt(null), [])

  const remaining = endAt == null ? 0 : Math.max(0, Math.ceil((endAt - now) / 1000))
  return { running: endAt != null, remaining, total, start, add, stop }
}

export function RestTimerPill({
  remaining,
  total,
  onAdd,
  onStop,
}: {
  remaining: number
  total: number
  onAdd: () => void
  onStop: () => void
}) {
  const m = Math.floor(remaining / 60)
  const s = String(remaining % 60).padStart(2, "0")
  const p = total > 0 ? Math.min(100, ((total - remaining) / total) * 100) : 0
  return (
    <div
      role="timer"
      aria-live="off"
      aria-label={`Rest: ${m} minutes ${s} seconds left`}
      className="relative flex items-center gap-2 overflow-hidden rounded-btn bg-pink px-3 py-1.5 text-ink shadow-fab"
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-[rgba(46,26,36,0.08)]" style={{ width: `${p}%` }} />
      <ClockIcon size={20} className="relative" />
      <span className="relative flex-1 text-[15px] font-bold">
        Rest <span className="inline-block min-w-[3.2ch] text-[20px] font-extrabold">{m}:{s}</span>
      </span>
      <button type="button" onClick={onAdd} className="relative min-h-[40px] rounded-[10px] px-2.5 text-[14px] font-bold">
        +15 s
      </button>
      <button type="button" onClick={onStop} className="relative min-h-[40px] rounded-[10px] bg-ink px-3 text-[14px] font-bold text-pink">
        Skip
      </button>
    </div>
  )
}
