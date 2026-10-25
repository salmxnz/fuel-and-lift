"use client"

import { useId, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { CameraIcon, LockIcon, TrashIcon } from "@/components/ui/icons"
import { Button, Chip, DashedNote, ErrorCard, Field, Skeleton, TextInput } from "@/components/ui/primitives"
import { Sheet } from "@/components/ui/sheet"
import { api, errorMessage, seg } from "@/lib/api/client"
import type { ProgressPhoto, ProgressPhotoResponse, ProgressPhotosResponse, ProgressPose } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { cn } from "@/lib/cn"
import { daysBetween, formatDayMonth, isISODate, parseISODate, todayISO } from "@/lib/dates"
import { num1, signed } from "@/lib/format"
import { prepareImage, type PreparedImage } from "@/lib/image"

const POSES: { value: ProgressPose; label: string }[] = [
  { value: "front", label: "Front" },
  { value: "side", label: "Side" },
  { value: "back", label: "Back" },
  { value: "other", label: "Other" },
]

const POSE_LABEL: Record<ProgressPose, string> = { front: "Front", side: "Side", back: "Back", other: "Other" }

/** How many thumbnails the card shows before "Show all". */
const PREVIEW_COUNT = 12

/** "12 Oct 2026" */
function fullDate(s: string): string {
  return parseISODate(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

/** Group heading: "12 Oct", with the year when it isn't this year. */
function groupDate(s: string, today: string): string {
  return s.slice(0, 4) === today.slice(0, 4) ? formatDayMonth(s) : fullDate(s)
}

function altText(p: ProgressPhoto): string {
  return `${POSE_LABEL[p.pose]}, ${fullDate(p.taken_on)}`
}

/** Newest first: by day, then by upload time. */
function newestFirst(a: ProgressPhoto, b: ProgressPhoto): number {
  if (a.taken_on !== b.taken_on) return a.taken_on < b.taken_on ? 1 : -1
  return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0
}

/** "12 days", "12 weeks", "7 months" */
function span(days: number): string {
  const d = Math.abs(days)
  if (d < 14) return `${d} day${d === 1 ? "" : "s"}`
  if (d < 120) return `${Math.round(d / 7)} weeks`
  const m = Math.round(d / 30.44)
  return `${m} month${m === 1 ? "" : "s"}`
}

/** Default comparison: oldest and newest of one pose (front first), else of all photos. */
function defaultPair(photos: ProgressPhoto[]): [string, string] | null {
  if (photos.length < 2) return null
  const byPose = new Map<ProgressPose, ProgressPhoto[]>()
  for (const p of photos) byPose.set(p.pose, [...(byPose.get(p.pose) ?? []), p])
  const pool =
    (byPose.get("front")?.length ?? 0) >= 2
      ? byPose.get("front")!
      : [...byPose.values()].filter((l) => l.length >= 2).sort((a, b) => b.length - a.length)[0] ?? photos
  // photos are newest first
  return [pool[pool.length - 1].id, pool[0].id]
}

export function ProgressPhotos() {
  const res = useApi<ProgressPhotosResponse>("progress/photos")
  const data = res.data
  const photos = useMemo(() => [...(data?.photos ?? [])].sort(newestFirst), [data])
  const today = todayISO()

  const [draft, setDraft] = useState<PreparedImage | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [viewId, setViewId] = useState<string | null>(null)
  const [comparing, setComparing] = useState(false)
  // A fresh compare sheet (default pair) each time it opens.
  const [compareKey, setCompareKey] = useState(0)
  const [showAll, setShowAll] = useState(false)
  const cameraInput = useRef<HTMLInputElement>(null)
  const libraryInput = useRef<HTMLInputElement>(null)

  const viewing = photos.find((p) => p.id === viewId) ?? null
  const full = !!data && photos.length >= data.limit
  const shown = showAll ? photos : photos.slice(0, PREVIEW_COUNT)
  const groups = useMemo(() => {
    const out: { date: string; photos: ProgressPhoto[] }[] = []
    for (const p of shown) {
      const last = out[out.length - 1]
      if (last && last.date === p.taken_on) last.photos.push(p)
      else out.push({ date: p.taken_on, photos: [p] })
    }
    return out
  }, [shown])

  async function pick(file: File | undefined) {
    if (cameraInput.current) cameraInput.current.value = ""
    if (libraryInput.current) libraryInput.current.value = ""
    if (!file) return
    setPreparing(true)
    try {
      setDraft(await prepareImage(file, { maxSide: 1200 }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't use that photo.")
    } finally {
      setPreparing(false)
    }
  }

  function closeDraft() {
    if (draft) URL.revokeObjectURL(draft.previewUrl)
    setDraft(null)
  }

  function added(photo: ProgressPhoto) {
    res.setData((prev) => ({
      enabled: prev?.enabled ?? true,
      limit: prev?.limit ?? data?.limit ?? 500,
      photos: [photo, ...(prev?.photos ?? []).filter((p) => p.id !== photo.id)].sort(newestFirst),
    }))
  }

  function removed(id: string) {
    res.setData((prev) => ({
      enabled: prev?.enabled ?? true,
      limit: prev?.limit ?? 500,
      photos: (prev?.photos ?? []).filter((p) => p.id !== id),
    }))
  }

  const fileInputs = (
    <>
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      <input
        ref={libraryInput}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
    </>
  )

  return (
    <section aria-labelledby="progress-photos-title" className="flex flex-col gap-3 rounded-card bg-white p-4">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="progress-photos-title" className="m-0 text-[17px] font-extrabold tracking-[-0.02em]">
            Progress photos
          </h2>
          {photos.length > 0 ? (
            <span className="text-[13px] text-muted">
              {photos.length} photo{photos.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
        <p className="m-0 flex items-center gap-1 text-[12.5px] text-muted">
          <LockIcon size={13} /> Only you can see these.
        </p>
      </div>

      {res.error && !data ? (
        <ErrorCard message={res.error.message} onRetry={() => void res.reload()} className="p-0" />
      ) : !data ? (
        <div className="grid grid-cols-3 gap-1.5" role="status" aria-label="Loading progress photos">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="aspect-[3/4] rounded-[12px]" />
          ))}
        </div>
      ) : (
        <>
          {photos.length === 0 ? (
            <DashedNote>
              {data.enabled
                ? "Take a photo every few weeks in the same spot and light. Side by side, they show what the scale can't."
                : "Photo storage isn't set up on this server, so progress photos can't be saved yet."}
            </DashedNote>
          ) : (
            <div className="flex flex-col gap-3">
              {groups.map((g) => (
                <div key={g.date} className="flex flex-col gap-1.5">
                  <h3 className="m-0 text-[13px] font-semibold text-muted">{groupDate(g.date, today)}</h3>
                  <ul className="m-0 grid list-none grid-cols-3 gap-1.5 p-0">
                    {g.photos.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          aria-haspopup="dialog"
                          onClick={() => setViewId(p.id)}
                          className="relative block w-full overflow-hidden rounded-[12px] bg-field motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.97]"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- signed R2 link */}
                          <img src={p.url} alt={altText(p)} loading="lazy" decoding="async" className="aspect-[3/4] w-full object-cover" />
                          <span className="pointer-events-none absolute inset-x-1.5 bottom-1.5 truncate rounded-[8px] bg-[rgba(46,26,36,0.55)] px-1.5 py-0.5 text-left text-[11px] font-semibold text-white">
                            {POSE_LABEL[p.pose]}
                            {p.weight_kg != null ? ` · ${num1(p.weight_kg)} kg` : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {photos.length > PREVIEW_COUNT ? (
                <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
                  {showAll ? "Show fewer" : `Show all ${photos.length}`}
                </Button>
              ) : null}
            </div>
          )}

          {data.enabled ? (
            full ? (
              <p className="m-0 text-[13px] text-muted">
                You&apos;ve reached {data.limit} photos. Delete a few to add new ones.
              </p>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  className="flex-1"
                  loading={preparing}
                  onClick={() => cameraInput.current?.click()}
                >
                  {preparing ? null : <CameraIcon size={18} />}
                  {photos.length === 0 ? "Take your first photo" : "Add photo"}
                </Button>
                <Button variant="outline" size="sm" disabled={preparing} onClick={() => libraryInput.current?.click()}>
                  From library
                </Button>
              </div>
            )
          ) : null}

          {photos.length >= 2 ? (
            <Button
              variant="outline"
              size="sm"
              aria-haspopup="dialog"
              onClick={() => {
                setCompareKey((k) => k + 1)
                setComparing(true)
              }}
            >
              Compare two photos
            </Button>
          ) : null}
        </>
      )}

      {fileInputs}

      <AddPhotoSheet draft={draft} today={today} onClose={closeDraft} onAdded={added} />
      <ViewerSheet photo={viewing} today={today} onClose={() => setViewId(null)} onDeleted={removed} />
      <CompareSheet key={compareKey} open={comparing} photos={photos} onClose={() => setComparing(false)} />
    </section>
  )
}

// ------------------------------------------------------------ Add

function PoseChips({ value, onChange, labelledBy }: { value: ProgressPose; onChange: (p: ProgressPose) => void; labelledBy: string }) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="flex flex-wrap gap-2">
      {POSES.map((p) => (
        <Chip key={p.value} selected={value === p.value} onClick={() => onChange(p.value)} className="min-h-[44px] px-4 text-[14px]">
          {p.label}
        </Chip>
      ))}
    </div>
  )
}

function AddPhotoSheet({
  draft,
  today,
  onClose,
  onAdded,
}: {
  draft: PreparedImage | null
  today: string
  onClose: () => void
  onAdded: (p: ProgressPhoto) => void
}) {
  const [pose, setPose] = useState<ProgressPose>("front")
  const [date, setDate] = useState(today)
  const [saving, setSaving] = useState(false)
  const poseLabel = useId()
  const dateId = useId()

  // Each new photo starts from today; the pose stays, since people shoot a series.
  const [lastDraft, setLastDraft] = useState(draft)
  if (draft !== lastDraft) {
    setLastDraft(draft)
    if (draft) setDate(today)
  }

  const dateOk = isISODate(date) && date <= today

  async function save() {
    if (!draft || !dateOk) return
    setSaving(true)
    try {
      const res = await api.post<ProgressPhotoResponse>("progress/photos", {
        media_type: draft.mediaType,
        data: draft.data,
        taken_on: date,
        pose,
      })
      onAdded(res.photo)
      toast.success("Progress photo saved")
      onClose()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={!!draft} onClose={() => !saving && onClose()} title="New progress photo" description="Only you can see it.">
      {draft ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
          <img
            src={draft.previewUrl}
            alt="Preview of your new photo"
            className="mx-auto max-h-[38dvh] w-auto max-w-full rounded-[16px] bg-field object-contain"
          />
          <div className="flex flex-col gap-1.5">
            <span id={poseLabel} className="text-[13px] font-semibold text-muted">
              Pose
            </span>
            <PoseChips value={pose} onChange={setPose} labelledBy={poseLabel} />
          </div>
          <Field label="Taken on" htmlFor={dateId} hint={!dateOk ? "Pick a day up to today." : undefined}>
            <TextInput
              id={dateId}
              type="date"
              value={date}
              max={today}
              required
              aria-invalid={!dateOk || undefined}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Button onClick={save} loading={saving} disabled={!dateOk}>
            Save photo
          </Button>
        </>
      ) : null}
    </Sheet>
  )
}

// ------------------------------------------------------------ View

function ViewerSheet({
  photo,
  today,
  onClose,
  onDeleted,
}: {
  photo: ProgressPhoto | null
  today: string
  onClose: () => void
  onDeleted: (id: string) => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Keep showing the last photo while the sheet slides away.
  const [shown, setShown] = useState(photo)
  if (photo && photo !== shown) {
    if (photo.id !== shown?.id) setConfirming(false)
    setShown(photo)
  }

  async function remove() {
    if (!shown) return
    if (!confirming) {
      setConfirming(true)
      return
    }
    setDeleting(true)
    try {
      await api.del(`progress/photos/${seg(shown.id)}`)
      onDeleted(shown.id)
      toast.success("Photo deleted")
      onClose()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setDeleting(false)
      setConfirming(false)
    }
  }

  const p = photo ?? shown
  return (
    <Sheet
      open={!!photo}
      onClose={() => !deleting && onClose()}
      title={p ? `${POSE_LABEL[p.pose]}, ${groupDate(p.taken_on, today)}` : "Progress photo"}
    >
      {p ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- signed R2 link */}
          <img
            src={p.url}
            alt={altText(p)}
            className="mx-auto max-h-[58dvh] w-auto max-w-full rounded-[16px] bg-field object-contain"
          />
          <dl className="m-0 grid grid-cols-3 gap-2 text-[14px]">
            <div className="flex flex-col gap-0.5 rounded-tile bg-white p-2.5">
              <dt className="text-[12px] text-muted">Date</dt>
              <dd className="m-0 font-bold">{fullDate(p.taken_on)}</dd>
            </div>
            <div className="flex flex-col gap-0.5 rounded-tile bg-white p-2.5">
              <dt className="text-[12px] text-muted">Pose</dt>
              <dd className="m-0 font-bold">{POSE_LABEL[p.pose]}</dd>
            </div>
            <div className="flex flex-col gap-0.5 rounded-tile bg-white p-2.5">
              <dt className="text-[12px] text-muted">Weight</dt>
              <dd className="m-0 font-bold">{p.weight_kg != null ? `${num1(p.weight_kg)} kg` : "Not logged"}</dd>
            </div>
          </dl>
          <Button variant="danger" size="md" onClick={remove} loading={deleting} className="bg-white" aria-live="polite">
            {deleting ? null : <TrashIcon size={18} />}
            {confirming ? "Tap again to delete" : "Delete photo"}
          </Button>
        </>
      ) : null}
    </Sheet>
  )
}

// ------------------------------------------------------------ Compare

function CompareSheet({ open, photos, onClose }: { open: boolean; photos: ProgressPhoto[]; onClose: () => void }) {
  // Picked ids; null means "use the default pair" so it follows the list as it loads.
  const [picked, setPicked] = useState<[string, string] | null>(null)
  const [slot, setSlot] = useState<0 | 1>(0)
  const pair = picked ?? defaultPair(photos)

  const a = photos.find((p) => p.id === pair?.[0])
  const b = photos.find((p) => p.id === pair?.[1])
  const [older, newer] = a && b ? (a.taken_on <= b.taken_on ? [a, b] : [b, a]) : [undefined, undefined]
  const days = older && newer ? daysBetween(older.taken_on, newer.taken_on) : 0
  const delta = older?.weight_kg != null && newer?.weight_kg != null ? newer.weight_kg - older.weight_kg : null

  let summary = ""
  if (older && newer) {
    if (days === 0) summary = delta != null ? `${signed(delta, 1)} kg, same day` : "Same day"
    else summary = delta != null ? `${signed(delta, 1)} kg in ${span(days)}` : `${span(days)} apart`
  }

  function choose(id: string) {
    const next: [string, string] = pair ? [...pair] : [id, id]
    next[slot] = id
    setPicked(next)
    // After picking the first, move on to the second.
    if (slot === 0) setSlot(1)
  }

  const sides = [a, b]
  return (
    <Sheet open={open} onClose={onClose} title="Compare" description="Tap a side, then pick a photo for it.">
      <div className="grid grid-cols-2 gap-2">
        {sides.map((p, i) => (
          <button
            key={i}
            type="button"
            aria-pressed={slot === i}
            aria-label={`${i === 0 ? "First" : "Second"} photo: ${p ? altText(p) : "none"}. Tap to change.`}
            onClick={() => setSlot(i as 0 | 1)}
            className={cn(
              "flex min-w-0 flex-col gap-1 rounded-[16px] border-2 p-1 text-left",
              slot === i ? "border-ink" : "border-transparent"
            )}
          >
            {p ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed R2 link
              <img src={p.url} alt="" className="aspect-[3/4] w-full rounded-[12px] bg-field object-cover" />
            ) : (
              <span className="aspect-[3/4] w-full rounded-[12px] bg-field" />
            )}
            {p ? (
              <span className="flex flex-col px-1 pb-0.5">
                <span className="text-[14px] font-bold">{fullDate(p.taken_on)}</span>
                <span className="text-[12.5px] text-muted">
                  {POSE_LABEL[p.pose]}
                  {p.weight_kg != null ? ` · ${num1(p.weight_kg)} kg` : ""}
                </span>
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {summary ? (
        <p className="m-0 rounded-tile bg-white px-3.5 py-3 text-center text-[17px] font-extrabold tracking-[-0.02em]" aria-live="polite">
          {summary}
          {delta == null && older && newer ? (
            <span className="mt-0.5 block text-[12.5px] font-normal tracking-normal text-muted">
              Log weigh-ins on these days to see the difference in kg.
            </span>
          ) : null}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-muted">
          Pick the {slot === 0 ? "first" : "second"} photo
        </span>
        <ul aria-label="Your progress photos" className="-mx-4 m-0 flex list-none gap-1.5 overflow-x-auto px-4 pb-1">
          {photos.map((p) => {
            const on = pair?.[slot] === p.id
            return (
              <li key={p.id} className="flex-none">
                <button
                  type="button"
                  aria-pressed={on}
                  aria-label={altText(p)}
                  onClick={() => choose(p.id)}
                  className={cn(
                    "relative block w-[64px] overflow-hidden rounded-[10px] border-2",
                    on ? "border-ink" : "border-transparent"
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed R2 link */}
                  <img src={p.url} alt="" loading="lazy" decoding="async" className="aspect-[3/4] w-full bg-field object-cover" />
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-[rgba(46,26,36,0.55)] px-1 py-px text-center text-[10px] font-semibold text-white">
                    {formatDayMonth(p.taken_on)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </Sheet>
  )
}
