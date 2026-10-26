"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Sheet } from "@/components/ui/sheet"
import { Avatar, Button, Field, TextInput } from "@/components/ui/primitives"
import { StatusPill, firstName } from "@/components/share/friend-picker"
import { ItemsEditor, TotalsRow } from "@/components/food/items-editor"
import { PhotoCarousel } from "@/components/food/photo-carousel"
import { api, errorMessage, seg } from "@/lib/api/client"
import { logAgain } from "@/components/food/offline-log"
import type { Day, DayResponse, Entry, EntryDayResponse, MealCategory, MealSlot, SaveEntryResponse } from "@/lib/api/types"
import { fromEntryItem, toEntryItems, type EditableItem } from "@/lib/items"
import { parseDecimal } from "@/lib/format"
import { BookmarkIcon, CheckIcon, PlusIcon, ShareIcon } from "@/components/ui/icons"
import { CategoryChips } from "@/components/food/category-chips"
import Link from "next/link"
import { cn } from "@/lib/cn"
import { todayISO } from "@/lib/dates"
import { IconChooser, useIconChoice } from "@/components/food/icon-picker"
import { iconFor } from "@/lib/food-icons"

export function EntrySheet({
  entry,
  slots,
  onClose,
  onDayChange,
  onShare,
  onLoggedToday,
}: {
  entry: Entry | null
  slots: MealSlot[]
  onClose: () => void
  onDayChange: (day: Day) => void
  /** Share or split this meal with friends. */
  onShare: (entry: Entry) => void
  /** An older meal was logged again today: show today. */
  onLoggedToday: (day: Day) => void
}) {
  return (
    <Sheet open={!!entry} onClose={onClose} title="Edit entry">
      {entry ? (
        <EntryForm
          key={entry.id}
          entry={entry}
          slots={slots}
          onClose={onClose}
          onDayChange={onDayChange}
          onShare={onShare}
          onLoggedToday={onLoggedToday}
        />
      ) : null}
    </Sheet>
  )
}

const ONE_OFF = "__oneoff__"

function EntryForm({
  entry,
  slots,
  onClose,
  onDayChange,
  onShare,
  onLoggedToday,
}: {
  entry: Entry
  slots: MealSlot[]
  onClose: () => void
  onDayChange: (day: Day) => void
  onShare: (entry: Entry) => void
  onLoggedToday: (day: Day) => void
}) {
  const today = todayISO()
  const [name, setName] = useState(entry.name)
  const [category, setCategory] = useState<MealCategory | null>(entry.category)
  const [savedId, setSavedId] = useState(entry.saved_meal_id)
  const [savingMeal, setSavingMeal] = useState(false)
  const [loggingAgain, setLoggingAgain] = useState(false)
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
  // Shows the stored picture or the guess from the name; saved once changed.
  const pic = useIconChoice(iconFor({ icon: entry.icon, name }))
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

  // Save this meal (from any day) to the user's saved meals.
  async function saveToMeals() {
    setSavingMeal(true)
    try {
      const res = await api.post<SaveEntryResponse>(`entries/${seg(entry.id)}/save`, {
        name: (name.trim() || entry.name).slice(0, 60),
        ...(category ? { category } : {}),
      })
      setSavedId(res.saved_meal.id)
      onDayChange(res.day)
      toast.success(`${res.saved_meal.name} is in your meals now. One tap next time.`)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSavingMeal(false)
    }
  }

  // Log an older meal again, today, in the same meal.
  async function logAgainToday() {
    setLoggingAgain(true)
    try {
      const res = await logAgain({ date: today, source: entry })
      toast.success(`${entry.name}, logged today. Easy.`)
      onClose()
      if (res) onLoggedToday(res.day)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setLoggingAgain(false)
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const body: Record<string, unknown> = { name: name.trim() || entry.name }
    if (pic.icon !== entry.icon) body.icon = pic.icon ?? "none"
    if (category !== entry.category) body.category = category ?? "none"
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
      toast.success(`${entry.name}, binned`)
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
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Field label="Name" htmlFor="entry-name">
            <TextInput id="entry-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
        <div className="pt-[22px]">
          <IconChooser icon={pic.icon} onClick={pic.openPicker} size={48} />
        </div>
      </div>
      {pic.sheet}
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
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-muted">What kind of meal</span>
        <CategoryChips value={category} onChange={setCategory} label="What kind of meal" />
      </div>
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
      {entry.shared_with.length > 0 ? (
        <section aria-labelledby="entry-shared" className="flex flex-col gap-2 rounded-card bg-white p-3.5">
          <h3 id="entry-shared" className="m-0 text-[13px] font-semibold text-muted">
            {entry.split_ways ? `Split ${entry.split_ways} ways with` : "Shared with"}
          </h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {entry.shared_with.map((f) => (
              <li key={f.id} className="flex items-center gap-2.5">
                <Avatar name={f.name} url={f.avatar_url} size={28} tone="pink" />
                <span className="min-w-0 flex-1 truncate text-[15px]">{firstName(f.name)}</span>
                <StatusPill status={f.status} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className={cn("grid gap-2", entry.date !== today ? "grid-cols-2" : "grid-cols-1")}>
        {savedId ? (
          <Link
            href="/saved-meals"
            className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-btn bg-pink-soft px-3 text-[15px] font-bold text-ink no-underline"
          >
            <CheckIcon size={18} className="text-protein" /> Saved
          </Link>
        ) : (
          <Button variant="outline" size="md" onClick={() => void saveToMeals()} loading={savingMeal} disabled={saving || deleting}>
            <BookmarkIcon size={18} /> {entry.date !== today ? "Save meal" : "Save to my meals"}
          </Button>
        )}
        {entry.date !== today ? (
          <Button variant="outline" size="md" onClick={() => void logAgainToday()} loading={loggingAgain} disabled={saving || deleting}>
            <PlusIcon size={18} /> Log today
          </Button>
        ) : null}
      </div>
      <Button variant="outline" size="md" onClick={() => onShare(entry)} disabled={saving || deleting}>
        <ShareIcon size={18} /> {entry.shared_with.length > 0 ? "Share with more friends" : "Share or split with a friend"}
      </Button>
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
