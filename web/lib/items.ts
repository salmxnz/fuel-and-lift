import type { EntryItem, EstimateItem, ItemSource, Macros } from "./api/types"
import { parseDecimal } from "./format"

/**
 * An item row the user can edit. Changing grams scales kcal and macros from
 * the original numbers; typing kcal pins it (grams then no longer move kcal,
 * and macros follow the pinned kcal instead).
 */
export type EditableItem = {
  key: string
  name: string
  assumption: string | null
  source: ItemSource
  confidence: number | null
  /** The numbers as the AI / database / saved meal gave them. */
  base: Macros & { grams: number | null }
  /** Raw text of the grams input. */
  gramsText: string
  /** Raw text of the kcal input when pinned, null when kcal follows grams. */
  kcalText: string | null
  included: boolean
  /** Added by the user in this editor (name is editable). */
  isNew: boolean
}

let seq = 0
export function itemKey(): string {
  seq += 1
  return `i${seq}`
}

export function fromEntryItem(item: EntryItem | EstimateItem, included = true): EditableItem {
  const grams = item.grams != null && item.grams > 0 ? item.grams : null
  return {
    key: itemKey(),
    name: item.name,
    assumption: item.assumption,
    source: item.source,
    confidence: "confidence" in item ? (item.confidence ?? null) : null,
    base: {
      grams,
      kcal: item.kcal ?? 0,
      protein_g: item.protein_g ?? 0,
      carbs_g: item.carbs_g ?? 0,
      fat_g: item.fat_g ?? 0,
    },
    gramsText: grams != null ? String(round(grams, 0)) : "",
    kcalText: null,
    included,
    isNew: false,
  }
}

export function newItem(): EditableItem {
  return {
    key: itemKey(),
    name: "",
    assumption: null,
    source: "user",
    confidence: null,
    base: { grams: null, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
    gramsText: "",
    kcalText: "",
    included: true,
    isNew: true,
  }
}

function round(n: number, digits = 1): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

/** The numbers this row contributes right now. */
export function computeItem(it: EditableItem): EntryItem {
  const grams = parseDecimal(it.gramsText)
  const gramsFactor = it.base.grams && grams != null && grams >= 0 ? grams / it.base.grams : 1
  const pinned = it.kcalText != null ? parseDecimal(it.kcalText) : null
  const kcal = pinned != null ? Math.max(0, pinned) : it.base.kcal * gramsFactor
  const macroFactor = pinned != null ? (it.base.kcal > 0 ? pinned / it.base.kcal : 0) : gramsFactor
  const touched = pinned != null || (grams != null && grams !== it.base.grams)
  return {
    name: it.name.trim() || "Item",
    grams: grams != null ? round(grams, 0) : it.base.grams,
    kcal: round(kcal, 0),
    protein_g: round(it.base.protein_g * macroFactor),
    carbs_g: round(it.base.carbs_g * macroFactor),
    fat_g: round(it.base.fat_g * macroFactor),
    assumption: it.assumption,
    // Numbers the user typed are theirs.
    source: it.isNew ? "user" : touched && it.source === "ai" ? "user" : it.source,
  }
}

export function totals(items: EditableItem[]): Macros {
  const t = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  for (const it of items) {
    if (!it.included) continue
    const c = computeItem(it)
    t.kcal += c.kcal
    t.protein_g += c.protein_g
    t.carbs_g += c.carbs_g
    t.fat_g += c.fat_g
  }
  return { kcal: Math.round(t.kcal), protein_g: round(t.protein_g), carbs_g: round(t.carbs_g), fat_g: round(t.fat_g) }
}

/** Included rows as API items; drops empty user rows. */
export function toEntryItems(items: EditableItem[]): EntryItem[] {
  return items
    .filter((it) => it.included)
    .filter((it) => !(it.isNew && !it.name.trim() && !parseDecimal(it.kcalText ?? "")))
    .map(computeItem)
}

/** kcal shown in the input: the pinned text, or the computed value. */
export function kcalDisplay(it: EditableItem): string {
  if (it.kcalText != null) return it.kcalText
  return String(computeItem(it).kcal)
}
