"use client"

// "At the gym now": a friend's live workout, with Train together. Also the
// partner strip inside your own session.

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Avatar, Button } from "@/components/ui/primitives"
import { DumbbellIcon } from "@/components/ui/icons"
import { api, ApiError, errorMessage, seg } from "@/lib/api/client"
import type { LiveSession, SessionResponse } from "@/lib/api/types"
import { cn } from "@/lib/cn"
import { num1 } from "@/lib/format"

/** "12 min" since a time, ticking every 30 s. */
export function useMinutesSince(iso: string) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(t)
  }, [])
  return Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000))
}

function lastSetText(l: LiveSession): string | null {
  const s = l.last_set
  if (!s) return null
  if (s.kg != null && s.reps != null) return `${num1(s.kg)} kg × ${s.reps}`
  if (s.reps != null) return `${s.reps} reps`
  return null
}

export function LiveTrainingCard({ live, canJoin = true }: { live: LiveSession; canJoin?: boolean }) {
  const router = useRouter()
  const [joining, setJoining] = useState(false)
  const mins = useMinutesSince(live.started_at)
  const share = live.exercises_total > 0 ? live.exercises_done / live.exercises_total : 0
  const set = lastSetText(live)

  async function join() {
    setJoining(true)
    try {
      const res = await api.post<SessionResponse>(`people/${seg(live.person.id)}/join-workout`, {})
      toast.success(`You're training with ${live.person.name}. Let's go.`)
      router.push(`/gym/session/${seg(res.session.id)}`)
    } catch (err) {
      if (err instanceof ApiError && err.code === "in_workout") toast.error("Finish the workout you've got going first.")
      else if (err instanceof ApiError && err.code === "not_training") toast.error(`${live.person.name} just wrapped up.`)
      else toast.error(errorMessage(err))
      setJoining(false)
    }
  }

  return (
    <section aria-label={`${live.person.name} is training now`} className="flex flex-col gap-3 rounded-card bg-ink p-4 text-white">
      <div className="flex items-center gap-3">
        <span className="relative flex-none">
          <Avatar name={live.person.name} url={live.person.avatar_url} size={44} />
          <span aria-hidden="true" className="live-dot absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-ink bg-pink" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[12px] font-bold text-pink">At the gym now · {mins < 1 ? "just started" : `${mins} min in`}</span>
          <span className="truncate text-[18px] font-black tracking-[-0.03em]">{live.template_name ?? "A workout"}</span>
        </div>
        <span aria-hidden="true" className="flex h-10 w-10 flex-none items-center justify-center rounded-[12px] bg-night-2 text-pink">
          <DumbbellIcon size={20} />
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="h-2 overflow-hidden rounded-full bg-night-2" role="img" aria-label={`${live.exercises_done} of ${live.exercises_total} exercises done`}>
          <div className="h-full origin-left rounded-full bg-pink transition-transform duration-500 ease-in-out" style={{ transform: `scaleX(${share})` }} />
        </div>
        <span className="text-[12.5px] text-night-muted">
          {live.exercises_done} of {live.exercises_total} exercises · {live.sets_done} set{live.sets_done === 1 ? "" : "s"}
          {live.current ? ` · on ${live.current}` : ""}
          {set ? ` (${set})` : ""}
        </span>
      </div>
      {canJoin && !live.finished_at ? (
        <Button variant="pink" onClick={join} loading={joining}>
          Train together
        </Button>
      ) : null}
    </section>
  )
}

/** Inside your own session: who you're training with, refreshed every 20 s. */
export function PartnerStrip({ partners }: { partners: LiveSession[] }) {
  if (partners.length === 0) return null
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Training together">
      {partners.map((p) => (
        <PartnerRow key={p.id} live={p} />
      ))}
    </ul>
  )
}

function PartnerRow({ live }: { live: LiveSession }) {
  const set = lastSetText(live)
  const share = live.exercises_total > 0 ? live.exercises_done / live.exercises_total : 0
  return (
    <li className="flex items-center gap-3 rounded-card bg-ink px-3.5 py-3 text-white">
      <span className="relative flex-none">
        <Avatar name={live.person.name} url={live.person.avatar_url} size={36} />
        {!live.finished_at ? (
          <span aria-hidden="true" className="live-dot absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-ink bg-pink" />
        ) : null}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-[14px] font-bold">
          {live.finished_at ? `${live.person.name} finished` : `With ${live.person.name}`}
          <span className="font-normal text-night-muted">
            {live.current && !live.finished_at ? ` · ${live.current}` : ""}
            {set && !live.finished_at ? ` ${set}` : ""}
          </span>
        </span>
        <div className="h-1.5 overflow-hidden rounded-full bg-night-2">
          <div className={cn("h-full origin-left rounded-full bg-pink transition-transform duration-500 ease-in-out")} style={{ transform: `scaleX(${share})` }} />
        </div>
      </div>
      <span className="flex-none text-[13px] font-extrabold text-pink tabular-nums">
        {live.exercises_done}/{live.exercises_total}
      </span>
    </li>
  )
}
