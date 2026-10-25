"use client"

import { useCallback, useEffect, useState } from "react"
import { ApiError, api } from "@/lib/api/client"
import { CACHE_KEY_PREFIX } from "@/lib/api/query-client"
import type { Cardio, Session } from "@/lib/api/types"

// Offline workouts: gyms in basements lose signal. Ticking sets, skipping an
// exercise, cardio and the order are saved on the phone when the network is
// gone and sent, in order, once it's back. The screen shows the server's
// session with the pending changes laid on top (applyPending), so a refetch
// never undoes them. Adding sets or exercises still needs the network: those
// need ids from the server.

export type QueuedOp =
  | { id: string; sessionId: string; kind: "set"; setId: string; body: { done: boolean; actual_kg?: number | null; actual_reps?: number | null } }
  | {
      id: string
      sessionId: string
      kind: "block"
      blockId: string
      body: { skipped?: boolean; cardio_done?: boolean; cardio_actual?: Cardio | null }
    }
  | { id: string; sessionId: string; kind: "order"; body: { block_ids: string[] } }

export type NewOp = QueuedOp extends infer T ? (T extends QueuedOp ? Omit<T, "id"> : never) : never

// Under the cache prefix, so signing out clears it with the rest.
const KEY = `${CACHE_KEY_PREFIX}offline-ops`
const EVENT = "fl:offline-queue"

function read(): QueuedOp[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as QueuedOp[]) : []
  } catch {
    return []
  }
}

function write(ops: QueuedOp[]) {
  try {
    if (ops.length) localStorage.setItem(KEY, JSON.stringify(ops))
    else localStorage.removeItem(KEY)
  } catch {
    /* storage full or unavailable: nothing more we can do */
  }
  window.dispatchEvent(new Event(EVENT))
}

export function pendingOps(sessionId: string): QueuedOp[] {
  return read().filter((o) => o.sessionId === sessionId)
}

export function enqueue(op: NewOp) {
  write([...read(), { ...op, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` } as QueuedOp])
}

/** The request an op stands for. */
function send(op: QueuedOp) {
  const base = `sessions/${encodeURIComponent(op.sessionId)}`
  switch (op.kind) {
    case "set":
      return api.patch(`${base}/sets/${encodeURIComponent(op.setId)}`, op.body)
    case "block":
      return api.patch(`${base}/blocks/${encodeURIComponent(op.blockId)}`, op.body)
    case "order":
      return api.put(`${base}/order`, op.body)
  }
}

let flushing: Promise<FlushResult> | null = null

export type FlushResult = { sent: number; dropped: number; left: number }

/**
 * Send queued ops in order. Stops at the first network failure (still
 * offline) or server error (try later); drops an op the server refuses
 * (4xx: a set that no longer exists), so one bad op never blocks the rest.
 */
export function flushQueue(): Promise<FlushResult> {
  if (flushing) return flushing
  flushing = (async () => {
    let sent = 0
    let dropped = 0
    for (;;) {
      const [op] = read()
      if (!op) break
      try {
        await send(op)
        sent++
      } catch (err) {
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) dropped++
        else break
      }
      write(read().filter((o) => o.id !== op.id))
    }
    return { sent, dropped, left: read().length }
  })().finally(() => {
    flushing = null
  })
  return flushing
}

/** True when the request never reached the server. */
export function isOffline(err: unknown): boolean {
  return err instanceof ApiError && err.status === 0
}

/** The session as it will be once the pending ops are sent. */
export function applyPending(s: Session, ops: QueuedOp[]): Session {
  let out = s
  for (const op of ops) {
    if (op.sessionId !== s.id) continue
    if (op.kind === "set") {
      out = {
        ...out,
        blocks: out.blocks.map((b) => ({
          ...b,
          sets: b.sets.map((x) =>
            x.id !== op.setId
              ? x
              : {
                  ...x,
                  done: op.body.done,
                  ...(op.body.done ? { actual_kg: op.body.actual_kg ?? x.actual_kg, actual_reps: op.body.actual_reps ?? x.actual_reps } : {}),
                }
          ),
        })),
      }
    } else if (op.kind === "block") {
      out = {
        ...out,
        blocks: out.blocks.map((b) =>
          b.id !== op.blockId
            ? b
            : {
                ...b,
                skipped: op.body.skipped ?? b.skipped,
                cardio_done: op.body.cardio_done ?? b.cardio_done,
                cardio_actual: op.body.cardio_actual !== undefined ? op.body.cardio_actual : b.cardio_actual,
              }
        ),
      }
    } else {
      const pos = new Map(op.body.block_ids.map((id, i) => [id, i]))
      if (pos.size === out.blocks.length && out.blocks.every((b) => pos.has(b.id))) {
        out = { ...out, blocks: out.blocks.map((b) => ({ ...b, position: pos.get(b.id)! })) }
      }
    }
  }
  return out
}

/**
 * Pending ops for a session, whether the device is online, and a flush that
 * runs on reconnect and every 20 s while anything is waiting. onSynced runs
 * after a flush that sent something (reload the session then).
 */
export function useOfflineQueue(sessionId: string, onSynced: () => void) {
  const [ops, setOps] = useState<QueuedOp[]>([])
  const [online, setOnline] = useState(true)

  useEffect(() => {
    const sync = () => setOps(pendingOps(sessionId))
    const net = () => setOnline(navigator.onLine)
    sync()
    net()
    window.addEventListener(EVENT, sync)
    window.addEventListener("storage", sync)
    window.addEventListener("online", net)
    window.addEventListener("offline", net)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener("storage", sync)
      window.removeEventListener("online", net)
      window.removeEventListener("offline", net)
    }
  }, [sessionId])

  const flush = useCallback(async () => {
    const res = await flushQueue()
    if (res.sent > 0 || res.dropped > 0) onSynced()
    return res
  }, [onSynced])

  const waiting = ops.length > 0
  useEffect(() => {
    if (!waiting || !online) return
    void flush()
    const t = window.setInterval(() => void flush(), 20_000)
    return () => window.clearInterval(t)
  }, [waiting, online, flush])

  return { ops, online, flush }
}
