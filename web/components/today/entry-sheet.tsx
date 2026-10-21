"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Sheet } from "@/components/ui/sheet"
import { Button, Field, TextInput } from "@/components/ui/primitives"
import { ItemsEditor, TotalsRow } from "@/components/food/items-editor"
import { PhotoCarousel } from "@/components/food/photo-carousel"
import { api, errorMessage, seg } from "@/lib/api/client"
import type { Day, DayResponse, Entry, EntryDayResponse, MealSlot } from "@/lib/api/types"
import { fromEntryItem, toEntryItems, type EditableItem } from "@/lib/items"
import { parseDecimal } from "@/lib/format"

export function EntrySheet({
  entry,
  slots,
  onClose,
  onDayChange,
}: {
  entry: Entry | null
  slots: MealSlot[]
  onClose: () => void
  onDayChange: (day: Day) => void
}) {
  return (
    <Sheet open={!!entry} onClose={onClose} title="Edit entry">
      {entry ? <EntryForm key={entry.id} entry={entry} slots={slots} onClose={onClose} onDayChange={onDayChange} /> : null}
    </Sheet>
  )
}

const ONE_OFF = "__oneoff__"

function EntryForm({
  entry,
  slots,
  onClose,
  onDayChange,
}: {
  entry: Entry
  slots: MealSlot[]
  onClose: () => void
  onDayChange: (day: Day) => void
}) {
  const [name, setName] = useState(entry.name)
  const [meal, setMeal] = useState<string>(entry.meal_slot_id ?? ONE_OFF)
  const [oneOffName, setOneOffName] = useState(entry.meal_slot_id ? "" : entry.meal_name)
  const hasItems = entry.items.length > 0
  const [items, setItems] = useState<EditableItem[]>(() => entry.items.map((it) => fromEntryItem(it)))
  // Entries logged without items (manual) edit their totals directly.
  const [manual, setManual] = useState({
    kcal: String(Math.round(entry.kcal)),
    protein: String(entry.protein_g),
    carbs: String(entry.carbs_g),
    fat: String(entry.fat_g),
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [photos, setPhotos] = useState(entry.photos ?? [])
  const [removingPhoto, setRemovingPhoto] = useState<string | null>(null)

  async function removePhoto(id: string) {
    setRemovingPhoto(id)
    try {
      await api.del(`photos/${seg(id)}`)
      setPhotos((list) => list.filter((p) => p.id !== id))
      const res = await api.get<DayResponse>(`days/${seg(entry.date)}`)
      onDayChange(res.day)
      toast.success("Photo deleted. The meal stays logged.")
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setRemovingPhoto(null)
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const body: Record<string, unknown> = { name: name.trim() || entry.name }
    if (meal === ONE_OFF) {
      body.meal_slot_id = null
      body.meal_name = oneOffName.trim() || entry.meal_name
    } else {
      body.meal_slot_id = meal
      body.meal_name = null
    }
    if (hasItems) {
      const next = toEntryItems(items)
      if (next.length === 0) {
        setError("Keep at least one item, or delete the entry.")
        return
      }
      body.items = next
    } else {
      const k = parseDecimal(manual.kcal)
      if (k == null || k < 0) {
        setError("Enter the calories.")
        return
      }
      // PATCH takes items, not totals: store the hand-typed numbers as one item.
      body.items = [
        {
          name: (name.trim() || entry.name).slice(0, 80),
          grams: null,
          kcal: Math.round(k),
          protein_g: parseDecimal(manual.protein) ?? 0,
          carbs_g: parseDecimal(manual.carbs) ?? 0,
          fat_g: parseDecimal(manual.fat) ?? 0,
          assumption: null,
          source: "user",
        },
      ]
    }
    setSaving(true)
    try {
      const res = await api.patch<EntryDayResponse>(`entries/${seg(entry.id)}`, body)
      onDayChange(res.day)
      toast.success("Saved")
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    setDeleting(true)
    try {
      const res = await api.del<DayResponse>(`entries/${seg(entry.id)}`)
      if (res?.day) onDayChange(res.day)
      toast.success(`Removed ${entry.name}`)
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3.5" noValidate>
      <PhotoCarousel
        photos={photos.map((p, i) => ({ key: p.id, src: p.url, alt: `${entry.name}, photo ${i + 1}` }))}
        onRemove={(id) => void removePhoto(id)}
        removeLabel="Delete photo"
        busyKey={removingPhoto}
      />
      <Field label="Name" htmlFor="entry-name">
        <TextInput id="entry-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Meal" htmlFor="entry-meal">
        <select
          id="entry-meal"
          value={meal}
          onChange={(e) => setMeal(e.target.value)}
          className="min-h-[48px] rounded-tile border border-line bg-white px-3 text-[15px]"
        >
          {slots.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          <option value={ONE_OFF}>Just for this day…</option>
        </select>
      </Field>
      {meal === ONE_OFF ? (
        <Field label="Meal name" htmlFor="entry-oneoff">
          <TextInput
            id="entry-oneoff"
            value={oneOffName}
            maxLength={60}
            placeholder="Late snack"
            onChange={(e) => setOneOffName(e.target.value)}
          />
        </Field>
      ) : null}

      {hasItems ? (
        <>
          <ItemsEditor items={items} onChange={setItems} addLabel="Add an item" />
          <TotalsRow items={items} />
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["kcal", "Calories (kcal)"],
              ["protein", "Protein (g)"],
              ["carbs", "Carbs (g)"],
              ["fat", "Fat (g)"],
            ] as const
          ).map(([k, label]) => (
            <Field key={k} label={label} htmlFor={`entry-${k}`}>
              <TextInput
                id={`entry-${k}`}
                inputMode="decimal"
                value={manual[k]}
                onChange={(e) => setManual((m) => ({ ...m, [k]: e.target.value }))}
              />
            </Field>
          ))}
        </div>
      )}

      {error ? (
        <p role="alert" className="m-0 text-[14px] font-semibold text-danger">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="danger" onClick={remove} loading={deleting} disabled={saving}>
          Delete
        </Button>
        <Button type="submit" loading={saving} disabled={deleting}>
          Save
        </Button>
      </div>
    </form>
  )
}
