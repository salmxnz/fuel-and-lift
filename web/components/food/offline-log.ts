"use client"

import { toast } from "sonner"
import { api, seg } from "@/lib/api/client"
import type { Entry, EntryDayResponse, SavedMeal } from "@/lib/api/types"
import { enqueue, isOffline, localEntry, newId, offlineNow } from "@/lib/offline-queue"

// Logging meals without signal: manual entries, saved meals and "log again"
// save on the phone and sync later (lib/offline-queue.ts). The day shows them
// straight away (useApi lays the outbox on top of days/{date}).

type EntryInput = Parameters<typeof localEntry>[3]

let offlineNoted = false

/**
 * POST a new entry with an id made here. Offline (or when the request never
 * gets through) it waits on the phone instead and resolves with null.
 * `label` is the meal's display name, `entry` what the day shows meanwhile.
 */
export async function logMeal(opts: {
  path: string
  date: string
  label: string
  body: Record<string, unknown>
  entry: EntryInput
}): Promise<EntryDayResponse | null> {
  const id = newId()
  const body = { ...opts.body, id }
  if (!offlineNow()) {
    try {
      return await api.post<EntryDayResponse>(opts.path, body)
    } catch (err) {
      if (!isOffline(err)) throw err
    }
  }
  const entry = localEntry(id, opts.date, opts.label, opts.entry)
  enqueue({ kind: "entry.add", date: opts.date, path: opts.path, entry, body: { ...body, logged_at: entry.logged_at } })
  if (!offlineNoted) {
    offlineNoted = true
    toast("You're offline. Meals are saved on this phone and sync when you're back.")
  }
  return null
}

/** Log a saved meal (with the chosen add-ons) to a day. */
export function logSavedMeal(opts: {
  date: string
  label: string
  meal: SavedMeal | undefined
  mealId: string
  target: { meal_slot_id?: string; meal_name?: string }
  addonIds: string[]
}) {
  const items = (opts.meal?.items ?? [])
    .filter((x) => !x.is_addon || opts.addonIds.includes(x.id))
    .map(({ name, grams, assumption, source, kcal, protein_g, carbs_g, fat_g }) => ({ name, grams, assumption, source, kcal, protein_g, carbs_g, fat_g }))
  return logMeal({
    path: `days/${seg(opts.date)}/saved-meals/${seg(opts.mealId)}`,
    date: opts.date,
    label: opts.label,
    body: { ...opts.target, addon_ids: opts.addonIds },
    entry: {
      ...opts.target,
      name: opts.meal?.name ?? "Saved meal",
      origin: "saved",
      saved_meal_id: opts.mealId,
      items,
      icon: opts.meal?.icon ?? null,
      category: opts.meal?.category ?? null,
    },
  })
}

/**
 * Log an entry again on a day. Without a meal in `target` it goes in the
 * same meal as before.
 */
export function logAgain(opts: { date: string; label?: string; source: Entry; target?: { meal_slot_id?: string; meal_name?: string } }) {
  const e = opts.source
  const where = opts.target ?? { meal_slot_id: e.meal_slot_id ?? undefined, meal_name: e.meal_slot_id ? undefined : e.meal_name }
  return logMeal({
    path: `entries/${seg(e.id)}/again`,
    date: opts.date,
    label: opts.label ?? e.meal_name,
    body: { date: opts.date, ...(opts.target ?? {}) },
    entry: {
      ...where,
      name: e.name,
      origin: e.origin,
      saved_meal_id: e.saved_meal_id,
      items: e.items,
      icon: e.icon,
      category: e.category,
      kcal: e.kcal,
      protein_g: e.protein_g,
      carbs_g: e.carbs_g,
      fat_g: e.fat_g,
    },
  })
}
