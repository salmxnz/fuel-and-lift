"use client"

import { useQuery } from "@tanstack/react-query"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useMe } from "@/components/me-context"
import { useTour } from "@/components/tour/tour"
import { Sheet } from "@/components/ui/sheet"
import { Avatar, Button } from "@/components/ui/primitives"
import { api, errorMessage, seg } from "@/lib/api/client"
import { invalidate } from "@/lib/api/query-client"
import type { MealSlotsResponse, RoutineResponse, Share, SharesResponse, TemplateResponse } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { kcal } from "@/lib/format"
import { AcceptMealSheet, dayLabel, partLabel } from "./incoming-shares"
import { firstName } from "./friend-picker"

/** How many answered or dismissed share ids are remembered per user. */
const SEEN_MAX = 200

function seenKey(userId: string) {
  return `adebite:shares-seen:${userId}`
}

function readSeen(userId: string): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(seenKey(userId)) ?? "[]")
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}

function writeSeen(userId: string, ids: string[]) {
  try {
    localStorage.setItem(seenKey(userId), JSON.stringify(ids.slice(-SEEN_MAX)))
  } catch {
    /* storage unavailable */
  }
}

/** "Addy split Pizza with you", "Addy shared a workout with you". */
function headline(s: Share): string {
  const who = firstName(s.from.name)
  if (s.meal) return `${who} ${s.split_ways ? "split" : "shared"} ${s.meal.name} with you`
  if (s.template) return `${who} shared the workout ${s.template.name} with you`
  if (s.routine) return `${who} shared the routine ${s.routine.name} with you`
  return `${who} shared something with you`
}

function detail(s: Share): string {
  if (s.meal) return `${partLabel(s.split_ways)} · ${kcal(s.meal.kcal)} kcal · ${s.meal.meal_name}, ${dayLabel(s.meal.date)}`
  if (s.template) {
    const ex = s.template.exercises
    return ex.length === 0 ? "No exercises yet" : ex.length > 3 ? `${ex.slice(0, 3).join(", ")} +${ex.length - 3}` : ex.join(", ")
  }
  if (s.routine) {
    const n = Object.values(s.routine.days).filter((d) => d != null).length
    return `${n} day${n === 1 ? "" : "s"} a week`
  }
  return ""
}

/**
 * Pops up whatever a friend just sent: once per share, on any screen but a
 * running workout or the tour. Push messages refresh it at once (see public/sw.js);
 * otherwise it checks every minute while the app is open.
 */
export function SharePopup() {
  const me = useMe()
  const router = useRouter()
  const pathname = usePathname()
  const userId = me.user.id
  const shares = useQuery<SharesResponse>({
    queryKey: ["shares"],
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  })
  // Read on the client only; the sheets don't render before mount anyway.
  const [seen, setSeen] = useState<string[] | null>(() => (typeof window === "undefined" ? null : readSeen(userId)))
  const [adding, setAdding] = useState<Share | null>(null)
  const [busy, setBusy] = useState(false)
  const slots = useApi<MealSlotsResponse>(adding ? "meal-slots" : null)

  // A push for a share means there's something new: fetch it now.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return
    const onMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === "share") invalidate(["shares"])
    }
    navigator.serviceWorker.addEventListener("message", onMessage)
    return () => navigator.serviceWorker.removeEventListener("message", onMessage)
  }, [])

  function markSeen(id: string) {
    setSeen((prev) => {
      const next = [...(prev ?? []).filter((x) => x !== id), id]
      writeSeen(userId, next)
      return next
    })
  }

  const tour = useTour()
  // Not over a running workout, nor over the first-run tour.
  const inWorkout = pathname?.startsWith("/gym/session") ?? false
  const current = seen && !inWorkout && !tour.active ? (shares.data?.shares ?? []).find((s) => !seen.includes(s.id)) : undefined
  const open = !!current && !adding

  async function accept(s: Share) {
    if (s.meal) {
      markSeen(s.id)
      setAdding(s)
      return
    }
    setBusy(true)
    try {
      if (s.template) {
        const res = await api.post<TemplateResponse>(`shares/${seg(s.id)}/accept`, {})
        toast.success(`${res.template.name} is in your templates`, {
          action: { label: "Open", onClick: () => router.push(`/gym/templates/${res.template.id}`) },
        })
      } else {
        const res = await api.post<RoutineResponse>(`shares/${seg(s.id)}/accept`, {})
        toast.success(`${res.routine.name} is in your routines`, {
          action: { label: "Open", onClick: () => router.push(`/gym/routines/${res.routine.id}`) },
        })
      }
      markSeen(s.id)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function decline(s: Share) {
    markSeen(s.id)
    try {
      await api.del(`shares/${seg(s.id)}`)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <>
      <Sheet open={open} onClose={() => current && markSeen(current.id)} title="Shared with you" hideTitle>
        {current ? (
          <div className="flex flex-col items-center gap-4 pt-1 text-center">
            <Avatar name={current.from.name} url={current.from.avatar_url} size={64} tone="pink" />
            <div className="flex flex-col gap-1">
              <p className="m-0 text-[19px] font-bold leading-[1.3]">{headline(current)}</p>
              <p className="m-0 text-[14px] text-muted">{detail(current)}</p>
            </div>
            <div className="flex w-full flex-col gap-2">
              <Button onClick={() => void accept(current)} loading={busy}>
                {current.meal ? "Add to my day" : current.template ? "Add to my templates" : "Add to my routines"}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => markSeen(current.id)} disabled={busy}>
                  Later
                </Button>
                <Button variant="ghost" onClick={() => void decline(current)} disabled={busy} className="text-muted">
                  No thanks
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </Sheet>
      <AcceptMealSheet
        share={adding && slots.data ? adding : null}
        slots={slots.data?.meal_slots ?? []}
        onClose={() => setAdding(null)}
        onAdded={(_share, res, slotName) => {
          setAdding(null)
          toast.success(`Added to ${slotName.toLowerCase()}, ${dayLabel(res.day.date)}`, {
            action: { label: "View", onClick: () => router.push("/today") },
          })
        }}
      />
    </>
  )
}
