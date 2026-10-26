"use client"

import type { QueryClient } from "@tanstack/react-query"
import { usePathname } from "next/navigation"
import { toast } from "sonner"
import { api, seg } from "@/lib/api/client"
import type { Cardio, Exercise, GymInsightsResponse, PlannedSet, Session, SessionBlock, SessionResponse, Template } from "@/lib/api/types"
import { startOfWeek } from "@/lib/dates"
import {
  enqueue,
  isOffline,
  localBlock,
  localSet,
  newId,
  offlineNow,
  pendingOps,
  sendNow,
  sessionOps,
  type NewOp,
} from "@/lib/offline-queue"

// Workouts without signal: starting one and adding exercises save on the
// phone when the network is gone (lib/offline-queue.ts sends them later).

/**
 * The workout id from the address bar. Offline, a workout started on the
 * phone opens from the page kept for another one (public/sw.js), so the id
 * the server rendered may not be this one.
 */
export function useSessionId(rendered: string): string {
  const path = usePathname()
  const m = path?.match(/^\/gym\/session\/([^/]+)/)
  return m && m[1] !== "_" ? decodeURIComponent(m[1]) : rendered
}

/** True when changes to this workout must wait their turn (offline, or earlier ones still waiting). */
export function mustQueue(sessionId: string): boolean {
  return offlineNow() || sessionOps(pendingOps(), sessionId).length > 0
}

let offlineNoted = false
function noteOffline() {
  if (offlineNoted) return
  offlineNoted = true
  toast("You're offline. This workout is saved on this phone and syncs when you're back.")
}

/** A workout as the server would start it, built from the cached template (and each block's notes). */
function localSession(id: string, date: string, template: Template | null, client: QueryClient): { session: Session; notes: (string | null)[] } {
  const extras = template
    ? (client.getQueryData<GymInsightsResponse>(["gym/insights"])?.extras ?? []).filter(
        (x) => x.template_id === template.id && x.week_start === startOfWeek(date)
      )
    : []
  const planned = [
    ...[...(template?.blocks ?? [])].sort((a, b) => a.position - b.position).map((b) => ({ exercise: b.exercise, sets: b.sets, cardio: b.cardio, notes: b.notes })),
    ...extras.map((x) => ({ exercise: x.exercise, sets: x.sets, cardio: null, notes: null })),
  ]
  const session: Session = {
    id,
    date,
    template_id: template?.id ?? null,
    template_name: template?.name ?? null,
    template_version: template?.current_version ?? null,
    status: "active",
    started_at: new Date().toISOString(),
    finished_at: null,
    blocks: planned.map((p, i) => ({
      id: newId(),
      position: i,
      exercise: p.exercise,
      skipped: false,
      cardio: p.cardio,
      cardio_done: false,
      cardio_actual: null,
      sets: p.sets.map((x, j) => ({ ...localSet({ ...x, id: newId() }), position: j })),
    })),
  }
  return { session, notes: planned.map((p) => p.notes) }
}

/**
 * Start a workout (from a template, or empty) and return its id. Without a
 * network it starts on the phone, from the cached template.
 */
export async function startWorkout(client: QueryClient, date: string, template: Template | null): Promise<string> {
  const id = newId()
  if (!offlineNow()) {
    try {
      const res = await api.post<SessionResponse>("sessions", { id, date, ...(template ? { template_id: template.id } : {}) })
      return res.session.id
    } catch (err) {
      if (!isOffline(err)) throw err
    }
  }
  const { session, notes } = localSession(id, date, template, client)
  enqueue({
    kind: "session.start",
    sessionId: id,
    session,
    body: {
      id,
      date,
      ...(template ? { template_id: template.id } : {}),
      started_at: session.started_at,
      blocks: session.blocks.map((b, i) => ({
        id: b.id,
        exercise_id: b.exercise.id,
        cardio: b.cardio,
        notes: notes[i] ?? null,
        sets: b.sets.map((x) => ({ id: x.id, warmup: x.warmup, target_kg: x.target_kg, target_reps: x.target_reps, to_failure: x.to_failure })),
      })),
    },
  })
  noteOffline()
  return id
}

/** Add an exercise to a workout; saved on the phone when offline. */
export async function addExercise(sessionId: string, exercise: Exercise, sets?: PlannedSet[], cardio?: Cardio | null): Promise<Session | null> {
  const { block, body } = localBlock(exercise, sets, cardio)
  if (!mustQueue(sessionId)) {
    try {
      return (await api.post<SessionResponse>(`sessions/${seg(sessionId)}/blocks`, body)).session
    } catch (err) {
      if (!isOffline(err)) throw err
    }
  }
  enqueue({ kind: "session.addBlock", sessionId, block, body })
  noteOffline()
  return null
}

/**
 * Send changes to a workout in order; from the first that can't reach the
 * server, the rest wait on the phone. Resolves with the server's latest
 * session, or null when anything was saved for later (the screens show it
 * anyway: useApi lays the outbox on top).
 */
export async function sendSessionOps(sessionId: string, ops: NewOp[]): Promise<Session | null> {
  let latest: Session | null = null
  for (let i = 0; i < ops.length; i++) {
    if (!mustQueue(sessionId)) {
      try {
        latest = (await sendNow<SessionResponse>(ops[i])).session
        continue
      } catch (err) {
        if (!isOffline(err)) throw err
      }
    }
    for (const op of ops.slice(i)) enqueue(op)
    noteOffline()
    return null
  }
  return latest
}

/** Ticking everything left in a block, as the server's "accept" does. */
export function acceptOps(sessionId: string, block: SessionBlock): NewOp[] {
  const ops: NewOp[] = []
  if (block.cardio) {
    if (!block.cardio_done) ops.push({ kind: "block", sessionId, blockId: block.id, body: { cardio_done: true } })
  } else {
    for (const set of block.sets.filter((x) => !x.done)) {
      ops.push({
        kind: "set",
        sessionId,
        setId: set.id,
        body: { done: true, actual_kg: set.actual_kg ?? set.target_kg, actual_reps: set.actual_reps ?? set.target_reps },
      })
    }
  }
  return ops
}

/** Finish a workout on the phone; the server finishes it (and finds PRs) once synced. */
export function finishLater(session: Session) {
  enqueue({ kind: "session.finish", sessionId: session.id, body: { finished_at: new Date().toISOString() } })
  toast.success(`${session.template_name ?? "Workout"} saved on this phone. It syncs when you're back online, and PRs show then.`)
}
