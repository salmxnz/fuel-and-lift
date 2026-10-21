"use client"

import { cn } from "@/lib/cn"
import { computeItem, kcalDisplay, newItem, totals, type EditableItem } from "@/lib/items"
import { CloseIcon, PlusIcon } from "@/components/ui/icons"
import { SmallNumber } from "@/components/ui/primitives"
import type { Macros } from "@/lib/api/types"
import { kcal as fmtKcal, num1 } from "@/lib/format"

type Props = {
  items: EditableItem[]
  onChange: (items: EditableItem[]) => void
  /** "numbered" (photo/describe) or "checklist" (restaurant: include/exclude). */
  variant?: "numbered" | "checklist"
  showGrams?: boolean
  addLabel?: string
  label?: string
}

const SOURCE_TAG: Record<string, { text: string; className: string }> = {
  official: { text: "Official table", className: "text-protein" },
  ai: { text: "AI estimate, worth checking", className: "text-warn" },
  database: { text: "Food database", className: "text-protein" },
  user: { text: "Your numbers", className: "text-muted" },
}

export function ItemsEditor({
  items,
  onChange,
  variant = "numbered",
  showGrams = true,
  addLabel = "Add something I missed",
  label = "Items",
}: Props) {
  function update(key: string, patch: Partial<EditableItem>) {
    onChange(items.map((it) => (it.key === key ? { ...it, ...patch } : it)))
  }
  function remove(key: string) {
    onChange(items.filter((it) => it.key !== key))
  }

  return (
    <section aria-label={label} className="flex flex-col rounded-card bg-white px-3.5 py-1">
      {items.length === 0 ? (
        <p className="m-0 py-3 text-[14px] text-muted">Nothing here yet. Add what you ate below.</p>
      ) : null}
      {items.map((it, i) => {
        const computed = computeItem(it)
        const name = it.name || `item ${i + 1}`
        const tag = SOURCE_TAG[it.source]
        const excluded = variant === "checklist" && !it.included
        return (
          <div key={it.key} className="flex items-center gap-2.5 border-b border-line-soft py-2.5 last:border-b-0">
            {variant === "numbered" ? (
              <span
                aria-hidden="true"
                className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-pink text-[11px] font-extrabold"
              >
                {i + 1}
              </span>
            ) : (
              <input
                type="checkbox"
                checked={it.included}
                onChange={(e) => update(it.key, { included: e.target.checked })}
                aria-label={`Include ${name}`}
                className="m-0 h-5 w-5 flex-none accent-ink"
              />
            )}
            <div className={cn("flex min-w-0 flex-1 flex-col", excluded && "text-muted")}>
              {excluded ? (
                <span className="truncate text-[15px] font-semibold line-through">{it.name}</span>
              ) : (
                // Every name is editable: AI names are a guess too. New rows
                // show a box; existing ones look like text until focused.
                <input
                  value={it.name}
                  placeholder="What was it?"
                  aria-label={`Item ${i + 1} name`}
                  maxLength={80}
                  onChange={(e) => update(it.key, { name: e.target.value })}
                  className={cn(
                    "min-h-[36px] w-full min-w-0 rounded-[10px] border px-2 text-[15px] font-bold",
                    it.isNew ? "border-line" : "-ml-2 border-transparent bg-transparent focus:border-line focus:bg-white"
                  )}
                />
              )}
              {variant === "checklist" && !it.isNew ? (
                excluded ? (
                  <span className="text-[12px]">Left out</span>
                ) : tag ? (
                  <span className={cn("text-[12px] font-semibold", tag.className)}>{tag.text}</span>
                ) : null
              ) : it.assumption ? (
                <span className="line-clamp-2 text-[12px] text-muted">{it.assumption}</span>
              ) : null}
            </div>
            {!excluded ? (
              <>
                {showGrams ? (
                  <SmallNumber
                    suffix="g"
                    widthClass="w-[50px]"
                    aria-label={`${name} grams`}
                    value={it.gramsText}
                    placeholder="–"
                    onChange={(e) => update(it.key, { gramsText: e.target.value })}
                  />
                ) : null}
                <SmallNumber
                  suffix="kcal"
                  widthClass="w-[56px]"
                  aria-label={`${name} kcal`}
                  dashed={variant === "checklist" && it.source === "ai"}
                  value={kcalDisplay(it)}
                  onChange={(e) => update(it.key, { kcalText: e.target.value })}
                  onBlur={() => {
                    if (it.kcalText !== null && it.kcalText.trim() === "" && !it.isNew) update(it.key, { kcalText: null })
                  }}
                />
              </>
            ) : null}
            {variant === "numbered" || it.isNew ? (
              <button
                type="button"
                aria-label={`Remove ${name}`}
                onClick={() => remove(it.key)}
                className="-mr-2 flex h-11 w-8 flex-none items-center justify-center text-muted"
              >
                <CloseIcon size={16} />
              </button>
            ) : null}
            <span className="sr-only">
              {computed.kcal} kcal, {computed.protein_g} g protein
            </span>
          </div>
        )
      })}
      <button
        type="button"
        onClick={() => onChange([...items, newItem()])}
        className="flex min-h-[44px] items-center gap-1.5 p-0 text-left text-[14px] font-semibold text-protein"
      >
        <PlusIcon size={18} />
        {addLabel}
      </button>
    </section>
  )
}

/** Total kcal + protein / carbs / fat, as under the AI estimate card. */
export function TotalsRow({ items, totalsOverride }: { items?: EditableItem[]; totalsOverride?: Macros }) {
  const t = totalsOverride ?? totals(items ?? [])
  return (
    <section
      aria-label="Meal total"
      aria-live="polite"
      className="grid items-end gap-2 px-1"
      style={{ gridTemplateColumns: "1.4fr repeat(3, minmax(0, 1fr))" }}
    >
      <div className="flex flex-col">
        <span className="text-[12px] text-muted">Total</span>
        <span className="text-[26px] font-extrabold tracking-[-0.02em]">
          {fmtKcal(t.kcal)} <span className="text-[13px] font-medium text-muted">kcal</span>
        </span>
      </div>
      <Macro label="Protein" value={t.protein_g} />
      <Macro label="Carbs" value={t.carbs_g} />
      <Macro label="Fat" value={t.fat_g} />
    </section>
  )
}

function Macro({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col">
      <span className="text-[12px] text-muted">{label}</span>
      <span className="text-[16px] font-bold">{num1(value)} g</span>
    </div>
  )
}
