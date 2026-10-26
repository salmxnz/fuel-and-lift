"use client"

import { useSyncExternalStore } from "react"
import { toast } from "sonner"
import { ApiError, NETWORK_EVENT, api, isNetworkDown } from "@/lib/api/client"
import type {
  AddSessionBlockRequest,
  Cardio,
  Day,
  DayMeal,
  Entry,
  FinishSessionResponse,
  Macros,
  NewWeighInRequest,
  PlannedSet,
  Session,
  SessionBlock,
  SessionSet,
  StartSessionRequest,
} from "@/lib/api/types"
import { num1 } from "@/lib/format"

// The outbox: changes made without a connection (gyms in basements lose
// signal). Workouts (start, exercises and sets added, ticks, skips, order,
// finish), logged meals and weigh-ins are saved on the phone and sent, in
// order, once the network is back (components/pwa/offline-sync.tsx flushes).
//
// Everything created offline gets its id here (newId), and the API accepts it
// and treats a repeat as "already done", so a retry after a lost response
// never duplicates anything and later changes can point at it straight away.
//
// Screens never read the outbox directly: useApi lays the pending changes on
// top of the cached server data (projectPath), so a refetch never undoes them.

type OpBase = { id: string; at?: string }

export type QueuedOp = OpBase &
  (
    | { kind: "session.start"; sessionId: string; session: Session; body: StartSessionRequest }
    | { kind: "session.addBlock"; sessionId: string; block: SessionBlock; body: AddSessionBlockRequest & { id: string } }
    | {
        kind: "session.addSet"
        sessionId: string
        blockId: string
        set: SessionSet
        body: PlannedSet & { id: string }
      }
    | {
        kind: "set"
        sessionId: string
        setId: string
        body: { done: boolean; actual_kg?: number | null; actual_reps?: number | null }
      }
    | {
        kind: "block"
        sessionId: string
        blockId: string
        body: { skipped?: boolean; cardio_done?: boolean; cardio_actual?: Cardio | null }
      }
    | { kind: "order"; sessionId: string; body: { block_ids: string[] } }
    | { kind: "session.finish"; sessionId: string; body: { finished_at: string } }
    /** path: days/{date}/entries, days/{date}/saved-meals/{id} or entries/{id}/again. */
    | { kind: "entry.add"; date: string; path: string; entry: Entry; body: Record<string, unknown> & { id: string } }
    | { kind: "weighin.put"; body: NewWeighInRequest }
  )

export type NewOp = QueuedOp extends infer T ? (T extends QueuedOp ? Omit<T, "id" | "at"> : never) : never

// ---------------------------------------------------------------- ids

/** A random UUID (v4), for things created on the phone. */
export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

// ---------------------------------------------------------------- storage

// Per user and outside the data cache's "fl-cache:" prefix: the sign-in page
// clears that cache, and a session that expired while offline must not cost
// the workout. Only signing out on purpose drops it (dropOutbox).
const KEY_PREFIX = "fl-outbox:"
const LEGACY_KEY = "fl-cache:offline-ops"
const EVENT = "fl:offline-queue"

let owner = "anon"

/** Whose outbox this tab reads and writes (components/query-provider.tsx). */
export function setOutboxOwner(userId: string) {
  if (owner === userId) return
  owner = userId
  migrateLegacy()
  emit()
}

const key = () => `${KEY_PREFIX}${owner}`

let cachedRaw: string | null = null
let cachedOps: QueuedOp[] = []
const EMPTY: QueuedOp[] = []

function read(): QueuedOp[] {
  if (typeof window === "undefined") return EMPTY
  let raw: string | null = null
  try {
    raw = localStorage.getItem(key())
  } catch {
    return EMPTY
  }
  if (raw === cachedRaw) return cachedOps
  cachedRaw = raw
  try {
    cachedOps = raw ? (JSON.parse(raw) as QueuedOp[]) : EMPTY
  } catch {
    cachedOps = EMPTY
  }
  return cachedOps
}

function write(ops: QueuedOp[]) {
  try {
    if (ops.length) localStorage.setItem(key(), JSON.stringify(ops))
    else localStorage.removeItem(key())
  } catch {
    /* storage full or unavailable: nothing more we can do */
  }
  emit()
}

function emit() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT))
}

/** Ops saved by the previous version (set ticks only), moved to this user's outbox. */
function migrateLegacy() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return
    localStorage.removeItem(LEGACY_KEY)
    const old = JSON.parse(raw) as QueuedOp[]
    if (Array.isArray(old) && old.length) write([...old, ...read()])
  } catch {
    /* unreadable: drop it */
  }
}

export function pendingOps(): QueuedOp[] {
  return read()
}

/** Save a change to send later, and try sending right away. */
export function enqueue(op: NewOp) {
  write([...read(), { ...op, id: newId(), at: new Date().toISOString() } as QueuedOp])
  void flushQueue()
}

/** Forget everything waiting (signing out on purpose). */
export function dropOutbox() {
  write([])
}

// ---------------------------------------------------------------- sending

/** Send an op now (not queued); resolves with the server's response. */
export function sendNow<T = unknown>(op: NewOp): Promise<T> {
  return send({ ...op, id: "" } as QueuedOp) as Promise<T>
}

/** The request an op stands for. */
function send(op: QueuedOp): Promise<unknown> {
  const base = "sessionId" in op ? `sessions/${encodeURIComponent(op.sessionId)}` : ""
  switch (op.kind) {
    case "session.start":
      return api.post("sessions", op.body)
    case "session.addBlock":
      return api.post(`${base}/blocks`, op.body)
    case "session.addSet":
      return api.post(`${base}/blocks/${encodeURIComponent(op.blockId)}/sets`, op.body)
    case "set":
      return api.patch(`${base}/sets/${encodeURIComponent(op.setId)}`, op.body)
    case "block":
      return api.patch(`${base}/blocks/${encodeURIComponent(op.blockId)}`, op.body)
    case "order":
      return api.put(`${base}/order`, op.body)
    case "session.finish":
      return api.post<FinishSessionResponse>(`${base}/finish`, op.body).then((out) => {
        const name = out.session.template_name ?? "Workout"
        toast.success(`${name} synced`)
        for (const r of out.records ?? []) toast.success(`New PR 🔥 ${r.exercise_name} ${num1(r.kg)} kg × ${r.reps}`)
        return out
      })
    case "entry.add":
      return api.post(op.path, op.body)
    case "weighin.put":
      return api.post("weigh-ins", op.body)
  }
}

let flushing: Promise<FlushResult> | null = null

export type FlushResult = { sent: number; dropped: number; left: number }

/**
 * Send queued ops in order. Stops at the first network failure (still
 * offline), server error or expired sign-in (try later; the outbox survives
 * signing in again); drops an op the server refuses (4xx: a set that no
 * longer exists), so one bad op never blocks the rest.
 */
export function flushQueue(): Promise<FlushResult> {
  if (flushing) return flushing
  if (typeof navigator !== "undefined" && !navigator.onLine) return Promise.resolve({ sent: 0, dropped: 0, left: read().length })
  flushing = (async () => {
    let sent = 0
    let dropped = 0
    let firstError = ""
    for (;;) {
      const [op] = read()
      if (!op) break
      try {
        await send(op)
        sent++
      } catch (err) {
        if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 401 && err.status !== 429) {
          dropped++
          firstError ||= err.message
        } else break
      }
      write(read().filter((o) => o.id !== op.id))
    }
    if (dropped > 0) {
      toast.error(
        dropped === 1 ? `A change saved offline couldn't sync: ${firstError}` : `${dropped} changes saved offline couldn't sync: ${firstError}`
      )
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

/**
 * True when there's no network: the phone says so, or the last request never
 * got through. Changes then go straight to the outbox instead of waiting on a
 * request that will fail.
 */
export function offlineNow(): boolean {
  return (typeof navigator !== "undefined" && !navigator.onLine) || isNetworkDown()
}

// ---------------------------------------------------------------- hooks

function subscribe(fn: () => void) {
  window.addEventListener(EVENT, fn)
  window.addEventListener("storage", fn)
  return () => {
    window.removeEventListener(EVENT, fn)
    window.removeEventListener("storage", fn)
  }
}

/** Everything waiting to be sent (re-renders when it changes). */
export function useOutbox(): QueuedOp[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY)
}

function subscribeOnline(fn: () => void) {
  window.addEventListener("online", fn)
  window.addEventListener("offline", fn)
  window.addEventListener(NETWORK_EVENT, fn)
  return () => {
    window.removeEventListener("online", fn)
    window.removeEventListener("offline", fn)
    window.removeEventListener(NETWORK_EVENT, fn)
  }
}

/** Whether requests get through (re-renders when it changes; see offlineNow). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => !offlineNow(),
    () => true
  )
}

/** The ops for one workout (the session screens). */
export function sessionOps(ops: QueuedOp[], sessionId: string): QueuedOp[] {
  return ops.filter((o) => "sessionId" in o && o.sessionId === sessionId)
}

// ---------------------------------------------------------------- projections

function patchSet(s: Session, setId: string, fn: (x: SessionSet) => SessionSet): Session {
  return { ...s, blocks: s.blocks.map((b) => ({ ...b, sets: b.sets.map((x) => (x.id === setId ? fn(x) : x)) })) }
}

/**
 * The workout as it will be once its pending ops are sent. A workout started
 * offline isn't on the server yet: its start op holds the whole session.
 */
export function projectSession(id: string, server: Session | undefined, ops: QueuedOp[]): Session | undefined {
  let out: Session | undefined = server
  if (!out) {
    const start = ops.find((o) => o.kind === "session.start" && o.sessionId === id)
    if (start?.kind === "session.start") out = start.session
  }
  if (!out) return undefined
  for (const op of ops) {
    if (!("sessionId" in op) || op.sessionId !== id) continue
    switch (op.kind) {
      case "session.start":
        break
      case "session.addBlock": {
        if (out.blocks.some((b) => b.id === op.block.id)) break
        const position: number = out.blocks.reduce((m, b) => Math.max(m, b.position + 1), 0)
        out = { ...out, blocks: [...out.blocks, { ...op.block, position }] }
        break
      }
      case "session.addSet":
        out = {
          ...out,
          blocks: out.blocks.map((b) => {
            if (b.id !== op.blockId || b.sets.some((x) => x.id === op.set.id)) return b
            const position = b.sets.reduce((m, x) => Math.max(m, x.position + 1), 0)
            return { ...b, sets: [...b.sets, { ...op.set, position }] }
          }),
        }
        break
      case "set":
        out = patchSet(out, op.setId, (x) => ({
          ...x,
          done: op.body.done,
          ...(op.body.done
            ? { actual_kg: op.body.actual_kg ?? x.actual_kg ?? x.target_kg, actual_reps: op.body.actual_reps ?? x.actual_reps ?? x.target_reps }
            : {}),
        }))
        break
      case "block":
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
        break
      case "order": {
        const pos = new Map(op.body.block_ids.map((bid, i) => [bid, i]))
        if (pos.size === out.blocks.length && out.blocks.every((b) => pos.has(b.id))) {
          out = { ...out, blocks: out.blocks.map((b) => ({ ...b, position: pos.get(b.id)! })) }
        }
        break
      }
      case "session.finish":
        out = { ...out, status: "finished", finished_at: out.finished_at ?? op.body.finished_at }
        break
    }
  }
  return out
}

/** A session list (Gym screen) with workouts started offline added and pending changes applied. */
export function projectSessions(list: Session[] | undefined, ops: QueuedOp[], range?: { from?: string; to?: string }): Session[] | undefined {
  const ids = new Set<string>()
  for (const op of ops) if ("sessionId" in op) ids.add(op.sessionId)
  if (ids.size === 0) return list
  const known = new Set((list ?? []).map((s) => s.id))
  const added: Session[] = []
  for (const op of ops) {
    if (op.kind !== "session.start" || known.has(op.sessionId)) continue
    const d = op.session.date
    if ((range?.from && d < range.from) || (range?.to && d > range.to)) continue
    const s = projectSession(op.sessionId, undefined, ops)
    if (s) added.push(s)
  }
  if (!list && added.length === 0) return list
  const projected = (list ?? []).map((s) => (ids.has(s.id) ? projectSession(s.id, s, ops) ?? s : s))
  return [...added.reverse(), ...projected]
}

const ZERO: Macros = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }

function sum(list: Macros[]): Macros {
  return list.reduce(
    (t, m) => ({ kcal: t.kcal + m.kcal, protein_g: t.protein_g + m.protein_g, carbs_g: t.carbs_g + m.carbs_g, fat_g: t.fat_g + m.fat_g }),
    ZERO
  )
}

/**
 * A day with meals logged offline added (totals recomputed). With no cached
 * day yet, one is built from `fallbackTarget` (the newest cached day's).
 */
export function projectDay(date: string, server: Day | undefined, ops: QueuedOp[], fallbackTarget?: Macros): Day | undefined {
  const entries = ops.flatMap((o) => (o.kind === "entry.add" && o.date === date ? [o.entry] : []))
  if (entries.length === 0) return server
  const base: Day | undefined =
    server ?? (fallbackTarget ? { date, target: fallbackTarget, totals: ZERO, remaining_kcal: fallbackTarget.kcal, meals: [] } : undefined)
  if (!base) return undefined
  const known = new Set(base.meals.flatMap((m) => m.entries.map((e) => e.id)))
  let meals: DayMeal[] = base.meals
  for (const e of entries) {
    if (known.has(e.id)) continue
    const i = meals.findIndex((m) => (e.meal_slot_id ? m.meal_slot_id === e.meal_slot_id : !m.meal_slot_id && m.name === e.meal_name))
    if (i >= 0) {
      meals = meals.map((m, j) => (j === i ? { ...m, entries: [...m.entries, e] } : m))
    } else {
      meals = [...meals, { meal_slot_id: e.meal_slot_id, name: e.meal_name, entries: [e], totals: ZERO }]
    }
  }
  meals = meals.map((m) => ({ ...m, totals: sum(m.entries) }))
  const totals = sum(meals.map((m) => m.totals))
  return { ...base, meals, totals, remaining_kcal: base.target.kcal - totals.kcal }
}

/** True for an entry that only exists on the phone so far. */
export function isPendingEntry(ops: QueuedOp[], entryId: string): boolean {
  return ops.some((o) => o.kind === "entry.add" && o.entry.id === entryId)
}

const SESSION_PATH = /^sessions\/([^/?]+)$/
const SESSIONS_LIST = /^sessions(\?|$)/
const DAY_PATH = /^days\/(\d{4}-\d{2}-\d{2})$/

/** Whether pending ops can change what path returns (useApi). */
export function projects(path: string): boolean {
  return SESSION_PATH.test(path) || SESSIONS_LIST.test(path) || DAY_PATH.test(path)
}

/**
 * The response for an /api/v1 path with pending ops laid on top. `fallback`
 * gives what a day without cached data starts from.
 */
export function projectPath<T>(path: string, data: T | undefined, ops: QueuedOp[], fallbackTarget?: () => Macros | undefined): T | undefined {
  if (ops.length === 0) return data
  let m = path.match(SESSION_PATH)
  if (m) {
    const id = decodeURIComponent(m[1])
    const server = (data as { session?: Session } | undefined)?.session
    const s = projectSession(id, server, ops)
    return s && s !== server ? ({ ...(data ?? {}), session: s } as T) : data
  }
  if (SESSIONS_LIST.test(path)) {
    const q = new URLSearchParams(path.split("?")[1] ?? "")
    const list = (data as { sessions?: Session[] } | undefined)?.sessions
    const next = projectSessions(list, ops, { from: q.get("from") ?? undefined, to: q.get("to") ?? undefined })
    return next && next !== list ? ({ ...(data ?? {}), sessions: next } as T) : data
  }
  m = path.match(DAY_PATH)
  if (m) {
    const server = (data as { day?: Day } | undefined)?.day
    const hasEntries = ops.some((o) => o.kind === "entry.add" && o.date === m![1])
    if (!hasEntries) return data
    const day = projectDay(m[1], server, ops, server ? undefined : fallbackTarget?.())
    return day && day !== server ? ({ ...(data ?? {}), day } as T) : data
  }
  return data
}

// ---------------------------------------------------------------- builders

/** A session block for an exercise added offline (mirrors POST sessions/{id}/blocks). */
export function localBlock(
  exercise: SessionBlock["exercise"],
  sets: PlannedSet[] | undefined,
  cardio: Cardio | null | undefined
): { block: SessionBlock; body: AddSessionBlockRequest & { id: string } } {
  const id = newId()
  const withIds = (sets ?? []).map((p) => ({ ...p, id: newId() }))
  return {
    block: {
      id,
      position: 0,
      exercise,
      skipped: false,
      cardio: cardio ?? null,
      cardio_done: false,
      cardio_actual: null,
      sets: withIds.map((p, j) => ({ ...localSet(p), position: j })),
    },
    body: { id, exercise_id: exercise.id, ...(cardio ? { cardio } : {}), ...(sets ? { sets: withIds } : {}) },
  }
}

/** A planned set as a session set, not done yet. */
export function localSet(p: PlannedSet & { id: string }): SessionSet {
  return {
    id: p.id,
    position: 0,
    warmup: p.warmup,
    target_kg: p.target_kg,
    target_reps: p.target_reps,
    to_failure: p.to_failure,
    actual_kg: null,
    actual_reps: null,
    done: false,
  }
}

type EntryInput = Partial<Macros> & {
  meal_slot_id?: string | null
  meal_name?: string | null
  name: string
  origin: Entry["origin"]
  items?: Entry["items"]
  saved_meal_id?: string | null
  icon?: string | null
  category?: Entry["category"]
}

/** An entry logged offline, as the day will show it. */
export function localEntry(id: string, date: string, mealName: string, input: EntryInput): Entry {
  const items = input.items ?? []
  const totals = items.length ? sum(items) : null
  return {
    id,
    date,
    meal_slot_id: input.meal_slot_id ?? null,
    meal_name: input.meal_name ?? mealName,
    name: input.name,
    origin: input.origin,
    saved_meal_id: input.saved_meal_id ?? null,
    ai_estimate_id: null,
    items,
    logged_at: new Date().toISOString(),
    photos: [],
    icon: input.icon ?? null,
    category: input.category ?? null,
    shared_with: [],
    split_ways: null,
    kcal: input.kcal ?? totals?.kcal ?? 0,
    protein_g: input.protein_g ?? totals?.protein_g ?? 0,
    carbs_g: input.carbs_g ?? totals?.carbs_g ?? 0,
    fat_g: input.fat_g ?? totals?.fat_g ?? 0,
  }
}
