"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Button, ErrorCard, Field, PageHeader, Skeleton, Switch, TextInput } from "@/components/ui/primitives"
import { ChevronRightIcon, CloseIcon, PencilIcon, PlusIcon } from "@/components/ui/icons"
import { Sheet } from "@/components/ui/sheet"
import { api, errorMessage, seg } from "@/lib/api/client"
import type {
  EntryDayResponse,
  MealSlotsResponse,
  SavedMeal,
  SavedMealItemInput,
  SavedMealResponse,
  SavedMealsResponse,
} from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { cn } from "@/lib/cn"
import { kcal, parseDecimal } from "@/lib/format"
import { targetBody, targetFromParams } from "@/lib/meal-target"
import { VisibilityBadge, VisibilityButton, VisibilitySelect } from "@/components/community/visibility-select"
import { ShopLink } from "@/components/community/shop-link"
import type { Visibility } from "@/lib/api/types"

export function SavedMealsScreen() {
  const params = useSearchParams()
  const router = useRouter()
  const pickMode = params.get("pick") === "1"
  const target = useMemo(() => targetFromParams(new URLSearchParams(params.toString())), [params])
  const saved = useApi<SavedMealsResponse>("saved-meals")
  const [editing, setEditing] = useState<SavedMeal | "new" | null>(null)
  const [picking, setPicking] = useState<SavedMeal | null>(null)

  const meals = saved.data?.saved_meals ?? []

  return (
    <div className="flex flex-col gap-3.5">
      <PageHeader
        back={pickMode ? "history" : "/me"}
        backLabel={pickMode ? "Back" : "Back to Me"}
        eyebrow={pickMode ? target.label : "Me"}
        title={pickMode ? "My meals" : "Saved meals"}
        right={pickMode ? undefined : <ShopLink kind="meal" />}
      />
      <p className="m-0 text-[14px] leading-[1.45] text-muted">
        {pickMode
          ? "Tap a meal to log it. Pick any add-ons you had with it."
          : "Meals you eat often, logged in one tap. Add-ons are extras you sometimes have, like a banana."}
      </p>

      {saved.error && !saved.data ? (
        <ErrorCard message={saved.error.message} onRetry={() => void saved.reload()} />
      ) : saved.loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-[76px] rounded-card" />
          <Skeleton className="h-[76px] rounded-card" />
        </div>
      ) : meals.length === 0 ? (
        <div className="rounded-card border-[1.5px] border-dashed border-dash p-4 text-[15px] text-muted">
          No saved meals yet. Log a meal from a photo and tap <strong className="text-ink">Save to my meals</strong>, or
          make one here.
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {meals.map((m) => {
            const base = m.items.filter((i) => !i.is_addon)
            const addons = m.items.filter((i) => i.is_addon)
            return (
              <li key={m.id} className="flex items-stretch rounded-card bg-white">
                <button
                  type="button"
                  onClick={() => (pickMode ? setPicking(m) : setEditing(m))}
                  className="flex min-h-[64px] flex-1 flex-col gap-1 px-4 py-3 text-left"
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-[16px] font-bold">{m.name}</span>
                    <span className="flex-none text-[15px] font-bold">
                      {kcal(m.base.kcal)} <span className="text-[12px] font-normal text-muted">kcal</span>
                    </span>
                  </span>
                  <span className="line-clamp-2 text-[13px] text-muted">
                    {base.map((i) => i.name).join(", ") || "No items"}
                    {addons.length > 0 ? ` · ${addons.length} add-on${addons.length === 1 ? "" : "s"}` : ""}
                  </span>
                  {m.visibility !== "private" || m.hidden ? (
                    <span className="flex">
                      <VisibilityBadge visibility={m.visibility} hidden={m.hidden} />
                    </span>
                  ) : null}
                </button>
                {pickMode ? (
                  <button
                    type="button"
                    aria-label={`Edit ${m.name}`}
                    onClick={() => setEditing(m)}
                    className="flex w-12 flex-none items-center justify-center border-l border-line-soft text-muted"
                  >
                    <PencilIcon size={18} />
                  </button>
                ) : (
                  <span aria-hidden="true" className="flex w-10 flex-none items-center justify-center text-muted">
                    <ChevronRightIcon size={18} />
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setEditing("new")}
        className="flex min-h-[52px] items-center justify-center gap-2 rounded-btn border-[1.5px] border-dashed border-dash text-[15px] font-bold"
      >
        <PlusIcon size={18} /> New saved meal
      </button>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New saved meal" : "Edit saved meal"}
        actions={
          editing && editing !== "new" ? (
            <VisibilityButton
              value={editing.visibility}
              hidden={editing.hidden}
              name={editing.name}
              path={`saved-meals/${seg(editing.id)}/visibility`}
              onChange={(v) => {
                setEditing({ ...editing, visibility: v })
                saved.setData((prev) => ({
                  saved_meals: (prev?.saved_meals ?? []).map((x) => (x.id === editing.id ? { ...x, visibility: v } : x)),
                }))
              }}
            />
          ) : null
        }
      >
        {editing !== null ? (
          <SavedMealForm
            key={editing === "new" ? "new" : editing.id}
            meal={editing === "new" ? null : editing}
            onSaved={(m, isNew) => {
              saved.setData((prev) => {
                const cur = prev?.saved_meals ?? []
                return { saved_meals: isNew ? [m, ...cur] : cur.map((x) => (x.id === m.id ? m : x)) }
              })
              setEditing(null)
            }}
            onDeleted={(id) => {
              saved.setData((prev) => ({ saved_meals: (prev?.saved_meals ?? []).filter((x) => x.id !== id) }))
              setEditing(null)
            }}
          />
        ) : null}
      </Sheet>

      <Sheet open={picking !== null} onClose={() => setPicking(null)} title={picking?.name ?? "Log meal"}>
        {picking ? (
          <PickForm
            key={picking.id}
            meal={picking}
            label={target.label}
            onLog={async (addonIds) => {
              try {
                await api.post<EntryDayResponse>(`days/${seg(target.date)}/saved-meals/${seg(picking.id)}`, {
                  ...targetBody(target),
                  addon_ids: addonIds,
                })
                toast.success(`${picking.name} logged to ${target.label}. Sorted.`)
                router.push(`/today?date=${target.date}`)
              } catch (err) {
                toast.error(errorMessage(err))
                throw err
              }
            }}
          />
        ) : null}
      </Sheet>
    </div>
  )
}

function PickForm({
  meal,
  label,
  onLog,
}: {
  meal: SavedMeal
  label: string
  onLog: (addonIds: string[]) => Promise<void>
}) {
  const addons = meal.items.filter((i) => i.is_addon)
  const [chosen, setChosen] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const total = meal.base.kcal + addons.filter((a) => chosen.includes(a.id)).reduce((s, a) => s + a.kcal, 0)
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-[14px] text-muted">
        {meal.items
          .filter((i) => !i.is_addon)
          .map((i) => i.name)
          .join(", ")}
      </p>
      {addons.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-muted">Add-ons</span>
          <div className="flex flex-wrap gap-1.5">
            {addons.map((a) => {
              const on = chosen.includes(a.id)
              return (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setChosen((c) => (on ? c.filter((x) => x !== a.id) : [...c, a.id]))}
                  className={cn(
                    "min-h-[40px] rounded-full px-3 text-[13px]",
                    on ? "border border-ink bg-pink font-semibold" : "border border-dashed border-dash"
                  )}
                >
                  {on ? a.name : `+ ${a.name}`} · {kcal(a.kcal)}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
      <Button
        loading={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await onLog(chosen)
          } catch {
            setBusy(false)
          }
        }}
      >
        Log {label.toLowerCase()} · {kcal(total)} kcal
      </Button>
    </div>
  )
}

type ItemDraft = {
  key: string
  name: string
  grams: string
  kcal: string
  protein: string
  carbs: string
  fat: string
  addon: boolean
}

let draftSeq = 0
const nextKey = () => `d${++draftSeq}`

function SavedMealForm({
  meal,
  onSaved,
  onDeleted,
}: {
  meal: SavedMeal | null
  onSaved: (m: SavedMeal, isNew: boolean) => void
  onDeleted: (id: string) => void
}) {
  const [visibility, setVisibility] = useState<Visibility>(meal?.visibility ?? "private")
  const slots = useApi<MealSlotsResponse>("meal-slots")
  const [name, setName] = useState(meal?.name ?? "")
  const [slotId, setSlotId] = useState<string>(meal?.default_meal_slot_id ?? "")
  const [items, setItems] = useState<ItemDraft[]>(() =>
    (meal?.items ?? []).map((i) => ({
      key: nextKey(),
      name: i.name,
      grams: i.grams != null ? String(i.grams) : "",
      kcal: String(i.kcal),
      protein: String(i.protein_g),
      carbs: String(i.carbs_g),
      fat: String(i.fat_g),
      addon: i.is_addon,
    }))
  )
  const [busy, setBusy] = useState<"save" | "delete" | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function patch(key: string, p: Partial<ItemDraft>) {
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i)))
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return setError("Give it a name")
    const out: SavedMealItemInput[] = []
    for (const d of items) {
      if (!d.name.trim()) continue
      const k = parseDecimal(d.kcal)
      if (k == null || k < 0) return setError(`Enter the calories for ${d.name.trim()}`)
      out.push({
        name: d.name.trim(),
        grams: parseDecimal(d.grams),
        kcal: Math.round(k),
        protein_g: parseDecimal(d.protein) ?? 0,
        carbs_g: parseDecimal(d.carbs) ?? 0,
        fat_g: parseDecimal(d.fat) ?? 0,
        assumption: null,
        source: "user",
        is_addon: d.addon,
      })
    }
    if (out.filter((i) => !i.is_addon).length === 0) return setError("Add at least one item that isn't an add-on")
    setBusy("save")
    setError(null)
    try {
      const body = { name: n, default_meal_slot_id: slotId || null, items: out, ...(meal ? {} : { visibility }) }
      const res = meal
        ? await api.put<SavedMealResponse>(`saved-meals/${seg(meal.id)}`, body)
        : await api.post<SavedMealResponse>("saved-meals", body)
      toast.success("Saved")
      onSaved(res.saved_meal, !meal)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function remove() {
    if (!meal) return
    if (!confirm) return setConfirm(true)
    setBusy("delete")
    try {
      await api.del(`saved-meals/${seg(meal.id)}`)
      toast.success(`Deleted ${meal.name}`)
      onDeleted(meal.id)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(null)
    }
  }

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-3.5">
      <Field label="Name" htmlFor="sm-name">
        <TextInput id="sm-name" value={name} maxLength={80} placeholder="Usual breakfast" onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Usually for" htmlFor="sm-slot">
        <select
          id="sm-slot"
          value={slotId}
          onChange={(e) => setSlotId(e.target.value)}
          className="min-h-[48px] rounded-tile border border-line bg-white px-3 text-[15px]"
        >
          <option value="">Any meal</option>
          {(slots.data?.meal_slots ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-muted">Items</span>
        {items.map((d, idx) => (
          <fieldset key={d.key} className="m-0 flex flex-col gap-2 rounded-tile border-0 bg-white p-3">
            <legend className="sr-only">Item {idx + 1}</legend>
            <div className="flex items-center gap-2">
              <input
                aria-label={`Item ${idx + 1} name`}
                value={d.name}
                maxLength={80}
                placeholder="Fried egg"
                onChange={(e) => patch(d.key, { name: e.target.value })}
                className="min-h-[40px] min-w-0 flex-1 rounded-[10px] border border-line px-2.5 text-[15px] font-bold"
              />
              <button
                type="button"
                aria-label={`Remove ${d.name || `item ${idx + 1}`}`}
                onClick={() => setItems((l) => l.filter((x) => x.key !== d.key))}
                className="flex h-10 w-10 flex-none items-center justify-center text-muted"
              >
                <CloseIcon size={16} />
              </button>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {(
                [
                  ["grams", "g"],
                  ["kcal", "kcal"],
                  ["protein", "P g"],
                  ["carbs", "C g"],
                  ["fat", "F g"],
                ] as const
              ).map(([k, unit]) => (
                <label key={k} className="flex flex-col gap-0.5 text-[11px] text-muted">
                  {unit}
                  <input
                    inputMode="decimal"
                    value={d[k]}
                    onChange={(e) => patch(d.key, { [k]: e.target.value })}
                    aria-label={`${d.name || `Item ${idx + 1}`} ${k}`}
                    className="min-h-[36px] w-full min-w-0 rounded-[10px] border border-line px-1.5 text-right text-[14px] font-semibold text-ink"
                  />
                </label>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <span id={`addon-${d.key}`} className="text-[13px]">
                Add-on <span className="text-muted">(optional extra)</span>
              </span>
              <Switch checked={d.addon} onChange={(v) => patch(d.key, { addon: v })} labelledBy={`addon-${d.key}`} />
            </div>
          </fieldset>
        ))}
        <button
          type="button"
          onClick={() =>
            setItems((l) => [
              ...l,
              { key: nextKey(), name: "", grams: "", kcal: "", protein: "", carbs: "", fat: "", addon: false },
            ])
          }
          className="flex min-h-[44px] items-center gap-1.5 text-[14px] font-semibold text-protein"
        >
          <PlusIcon size={18} /> Add an item
        </button>
      </div>

      {/* An existing meal's who-can-see-it lives on the sheet's top-right button. */}
      {meal ? null : (
        <div className="rounded-tile bg-white p-3">
          <VisibilitySelect value={visibility} onChange={setVisibility} />
        </div>
      )}
      {meal?.copied_from ? <p className="m-0 text-[12px] text-muted">Added from {meal.copied_from.name}&apos;s meal.</p> : null}

      {error ? (
        <p role="alert" className="m-0 text-[14px] font-semibold text-danger">
          {error}
        </p>
      ) : null}
      <div className={cn("grid gap-2", meal ? "grid-cols-2" : "grid-cols-1")}>
        {meal ? (
          <Button variant="danger" onClick={remove} loading={busy === "delete"} disabled={busy === "save"}>
            {confirm ? "Tap to confirm" : "Delete"}
          </Button>
        ) : null}
        <Button type="submit" loading={busy === "save"} disabled={busy === "delete"}>
          Save
        </Button>
      </div>
    </form>
  )
}
