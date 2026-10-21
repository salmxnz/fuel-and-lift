"use client"

import { useRouter } from "next/navigation"
import { useState, useSyncExternalStore } from "react"
import { toast } from "sonner"
import { useMe } from "@/components/me-context"
import { Button, Chip, Field, PageHeader, TextInput } from "@/components/ui/primitives"
import { api, errorMessage } from "@/lib/api/client"
import type { ActivityLevel, CoachVoice, Profile, ProfileResponse, Units, WeighInCadence } from "@/lib/api/types"
import { localTimeZone } from "@/lib/dates"
import { parseDecimal } from "@/lib/format"

const ZONES: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? []
  } catch {
    return []
  }
})()

const CADENCE: { id: WeighInCadence; label: string }[] = [
  { id: "few_per_week", label: "A few times a week" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "quarterly", label: "Every 3 months" },
]

const subscribeNoop = () => () => {}

const ACTIVITY = ["Sedentary", "Lightly active", "Somewhat active", "Moderately active", "Very active", "Extremely active"]

export function ProfileScreen() {
  const me = useMe()
  const router = useRouter()
  const p = me.profile
  const [form, setForm] = useState({
    display_name: p?.display_name ?? me.user.name ?? "",
    units: (p?.units ?? "metric") as Units,
    timezone: p?.timezone ?? localTimeZone(),
    coach_voice: (p?.coach_voice ?? "neutral") as CoachVoice,
    weigh_in_cadence: (p?.weigh_in_cadence ?? "weekly") as WeighInCadence,
    height: p?.height_cm ? String(p.height_cm) : "",
    activity_level: (p?.activity_level ?? 3) as ActivityLevel,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Server render can't know the device's zone: assume it matches.
  const deviceZone = useSyncExternalStore(subscribeNoop, localTimeZone, () => form.timezone)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const height = parseDecimal(form.height)
    if (!form.display_name.trim()) return setError("Enter your name")
    if (height == null || height < 120 || height > 230) return setError("Height should be in cm, between 120 and 230")
    setSaving(true)
    setError(null)
    const body: Partial<Profile> = {
      display_name: form.display_name.trim(),
      units: form.units,
      timezone: form.timezone,
      coach_voice: form.coach_voice,
      weigh_in_cadence: form.weigh_in_cadence,
      height_cm: height,
      activity_level: form.activity_level,
    }
    try {
      await api.patch<ProfileResponse>("profile", body)
      toast.success("Saved")
      router.refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-4">
      <PageHeader back="/me" backLabel="Back to Me" eyebrow="Me" title="Profile and units" />
      <Field label="Name" htmlFor="pf-name">
        <TextInput id="pf-name" value={form.display_name} maxLength={40} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
      </Field>
      <div className="flex flex-col gap-1.5">
        <span id="pf-units" className="text-[13px] font-semibold text-muted">
          Units
        </span>
        <div role="radiogroup" aria-labelledby="pf-units" className="flex gap-1.5">
          <Chip selected={form.units === "metric"} onClick={() => setForm({ ...form, units: "metric" })}>
            kg and cm
          </Chip>
          <Chip selected={form.units === "imperial"} onClick={() => setForm({ ...form, units: "imperial" })}>
            lb and ft
          </Chip>
        </div>
      </div>
      <Field
        label="Time zone"
        htmlFor="pf-tz"
        hint={form.timezone !== deviceZone ? `This device is on ${deviceZone}.` : "Days and reminders follow this zone."}
      >
        {ZONES.length ? (
          <select
            id="pf-tz"
            value={form.timezone}
            onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            className="min-h-12 rounded-tile border border-line bg-white px-3 text-[15px]"
          >
            {!ZONES.includes(form.timezone) ? <option value={form.timezone}>{form.timezone}</option> : null}
            {ZONES.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        ) : (
          <TextInput id="pf-tz" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
        )}
      </Field>
      <Field label="Height (cm)" htmlFor="pf-height">
        <TextInput id="pf-height" inputMode="decimal" value={form.height} onChange={(e) => setForm({ ...form, height: e.target.value })} />
      </Field>
      <Field label="Activity level" htmlFor="pf-activity">
        <select
          id="pf-activity"
          value={form.activity_level}
          onChange={(e) => setForm({ ...form, activity_level: Number(e.target.value) as ActivityLevel })}
          className="min-h-12 rounded-tile border border-line bg-white px-3 text-[15px]"
        >
          {ACTIVITY.map((label, i) => (
            <option key={label} value={i + 1}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Weigh-in reminders" htmlFor="pf-cadence">
        <select
          id="pf-cadence"
          value={form.weigh_in_cadence}
          onChange={(e) => setForm({ ...form, weigh_in_cadence: e.target.value as WeighInCadence })}
          className="min-h-12 rounded-tile border border-line bg-white px-3 text-[15px]"
        >
          {CADENCE.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex flex-col gap-1.5">
        <span id="pf-voice" className="text-[13px] font-semibold text-muted">
          Coach voice
        </span>
        <div role="radiogroup" aria-labelledby="pf-voice" className="flex gap-1.5">
          <Chip selected={form.coach_voice === "neutral"} onClick={() => setForm({ ...form, coach_voice: "neutral" })}>
            Neutral
          </Chip>
          <Chip selected={form.coach_voice === "casual"} onClick={() => setForm({ ...form, coach_voice: "casual" })}>
            Casual
          </Chip>
        </div>
      </div>
      {error ? (
        <p role="alert" className="m-0 text-[14px] font-semibold text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" loading={saving}>
        Save
      </Button>
    </form>
  )
}
