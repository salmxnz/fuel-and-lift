"use client"

import { useSearchParams } from "next/navigation"
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button, Field, PageHeader, TextInput } from "@/components/ui/primitives"
import { api, errorMessage, seg } from "@/lib/api/client"
import type { EntryDayResponse } from "@/lib/api/types"
import { parseDecimal } from "@/lib/format"
import { targetBody, targetFromParams } from "@/lib/meal-target"
import { guessIcon } from "@/lib/food-icons"
import { IconChooser, useIconChoice } from "./icon-picker"

/** Enter it manually: name + kcal + protein / carbs / fat. */
export function ManualScreen() {
  const params = useSearchParams()
  const router = useRouter()
  const target = useMemo(() => targetFromParams(new URLSearchParams(params.toString())), [params])
  const [form, setForm] = useState({ name: "", kcal: "", protein: "", carbs: "", fat: "" })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const { icon, openPicker, sheet } = useIconChoice(guessIcon(form.name))

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const next: Record<string, string> = {}
    const name = form.name.trim()
    const k = parseDecimal(form.kcal)
    if (!name) next.name = "Give it a name"
    if (k == null || k < 0 || k > 10000) next.kcal = "Enter calories between 0 and 10,000"
    for (const key of ["protein", "carbs", "fat"] as const) {
      const v = form[key].trim() ? parseDecimal(form[key]) : 0
      if (v == null || v < 0 || v > 1000) next[key] = "Enter grams, or leave empty"
    }
    setErrors(next)
    if (Object.keys(next).length > 0) return
    setSaving(true)
    try {
      await api.post<EntryDayResponse>(`days/${seg(target.date)}/entries`, {
        ...targetBody(target),
        name,
        origin: "manual",
        kcal: Math.round(k ?? 0),
        protein_g: parseDecimal(form.protein) ?? 0,
        carbs_g: parseDecimal(form.carbs) ?? 0,
        fat_g: parseDecimal(form.fat) ?? 0,
        icon: icon ?? "none",
      })
      toast.success(`Logged to ${target.label}. Nice one.`)
      router.push(`/today?date=${target.date}`)
    } catch (err) {
      toast.error(errorMessage(err))
      setSaving(false)
    }
  }

  return (
    <main className="app-column pb-safe flex min-h-dvh flex-col gap-4">
      <PageHeader back="history" eyebrow={target.label} title="Enter it manually" titleClassName="text-[20px]" />
      <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <Field label="What was it?" htmlFor="m-name" hint={errors.name ? <Err>{errors.name}</Err> : undefined}>
              <TextInput
                id="m-name"
                autoFocus
                value={form.name}
                maxLength={80}
                placeholder="Protein bar"
                aria-invalid={!!errors.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
          </div>
          <div className="pt-[22px]">
            <IconChooser icon={icon} onClick={openPicker} size={48} />
          </div>
        </div>
        <Field label="Calories (kcal)" htmlFor="m-kcal" hint={errors.kcal ? <Err>{errors.kcal}</Err> : undefined}>
          <TextInput
            id="m-kcal"
            inputMode="decimal"
            value={form.kcal}
            placeholder="210"
            aria-invalid={!!errors.kcal}
            onChange={(e) => set("kcal", e.target.value)}
            className="text-[20px] font-bold"
          />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["protein", "Protein (g)"],
              ["carbs", "Carbs (g)"],
              ["fat", "Fat (g)"],
            ] as const
          ).map(([k, label]) => (
            <Field key={k} label={label} htmlFor={`m-${k}`} hint={errors[k] ? <Err>{errors[k]}</Err> : undefined}>
              <TextInput
                id={`m-${k}`}
                inputMode="decimal"
                value={form[k]}
                placeholder="0"
                aria-invalid={!!errors[k]}
                onChange={(e) => set(k, e.target.value)}
              />
            </Field>
          ))}
        </div>
        <Button type="submit" loading={saving} className="mt-2">
          Log {target.label.toLowerCase()}
        </Button>
      </form>
      {sheet}
    </main>
  )
}

function Err({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-danger">{children}</span>
}
