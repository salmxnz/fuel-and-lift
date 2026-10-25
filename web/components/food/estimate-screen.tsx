"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Button, ErrorCard, PageHeader, Spinner } from "@/components/ui/primitives"
import { CameraIcon, CloseIcon, PlusIcon } from "@/components/ui/icons"
import { prepareImage, type PreparedImage } from "@/lib/image"
import { targetFromParams } from "@/lib/meal-target"
import { cn } from "@/lib/cn"
import { toEntryItems } from "@/lib/items"
import { EASE_OUT, SPRING_SNAPPY } from "@/lib/motion"
import { ItemsEditor, TotalsRow } from "./items-editor"
import { CorrectionCard, LogFooter, QuestionsCard, TitleInput } from "./estimate-parts"
import { PhotoCarousel } from "./photo-carousel"
import { useEstimate, useLogActions } from "./use-estimate"
import { IconChooser, useIconChoice } from "./icon-picker"
import { guessIcon } from "@/lib/food-icons"

const MAX_PHOTOS = 3

/** AI-Estimate.dc.html for both "Take a photo" and "Describe it". */
export function EstimateScreen({ mode }: { mode: "photo" | "text" }) {
  const params = useSearchParams()
  const target = useMemo(() => targetFromParams(new URLSearchParams(params.toString())), [params])
  const est = useEstimate(mode)
  const actions = useLogActions({ target, origin: "ai", estimateId: est.estimate?.estimate_id })
  const pic = useIconChoice(est.estimate?.icon ?? guessIcon(est.title))
  // Up to 3 photos of the meal, then "Estimate" sends them together.
  const [photos, setPhotos] = useState<(PreparedImage & { key: string })[]>([])
  const [focus, setFocus] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)
  // ?text= prefills the description ("Join them" from a friend's meal).
  const [note, setNote] = useState(() => params.get("text")?.trim().slice(0, 300) ?? "")
  const cameraInput = useRef<HTMLInputElement>(null)
  const libraryInput = useRef<HTMLInputElement>(null)
  const reduce = useReducedMotion()

  // Free the previews' object URLs when we leave.
  const photosRef = useRef(photos)
  useEffect(() => {
    photosRef.current = photos
  }, [photos])
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl)), [])

  async function addFiles(files: FileList | null) {
    const room = MAX_PHOTOS - photos.length
    const list = Array.from(files ?? []).slice(0, Math.max(0, room))
    if ((files?.length ?? 0) > room) toast(`Up to ${MAX_PHOTOS} photos: added the first ${room}.`)
    if (list.length === 0) return
    setPreparing(true)
    try {
      for (const file of list) {
        const prepared = await prepareImage(file)
        const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`
        setPhotos((ps) => [...ps, { ...prepared, key }])
        setFocus(key)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't use that photo.")
    } finally {
      setPreparing(false)
      if (cameraInput.current) cameraInput.current.value = ""
      if (libraryInput.current) libraryInput.current.value = ""
    }
  }

  function removePhoto(key: string) {
    setPhotos((ps) => {
      const gone = ps.find((p) => p.key === key)
      if (gone) URL.revokeObjectURL(gone.previewUrl)
      return ps.filter((p) => p.key !== key)
    })
  }

  async function estimate() {
    if (photos.length === 0) return
    await est.run({
      images: photos.map((p) => ({ media_type: p.mediaType, data: p.data })),
      text: note.trim() || undefined,
    })
  }

  const hasResult = est.status === "ready" || est.status === "refining"
  const busy = est.status === "loading"
  const carousel = photos.map((p, i) => ({ key: p.key, src: p.previewUrl, alt: `${target.label} photo ${i + 1}` }))
  const entryItems = toEntryItems(est.items)

  return (
    <main className="app-column flex min-h-dvh flex-col gap-3">
      <PageHeader
        back="history"
        backLabel="Back"
        eyebrow={target.label}
        title={hasResult ? "Check what I found" : mode === "photo" ? "Take a photo" : "Describe it"}
        titleClassName="text-[20px] tracking-[-0.01em]"
      />

      {photos.length > 0 && (busy || hasResult) ? (
        <PhotoCarousel
          photos={carousel}
          overlay={
            busy ? (
              <span className="flex items-center gap-2">
                <Spinner size={18} /> Finding each item…
              </span>
            ) : null
          }
        />
      ) : null}

      {!hasResult && !busy ? (
        mode === "photo" ? (
          <section className="flex flex-col gap-3">
            {photos.length === 0 ? (
              <>
                <label className="flex cursor-pointer items-center gap-3.5 rounded-[20px] border border-[rgba(46,26,36,0.12)] bg-pink p-4 text-ink transition-transform duration-150 ease-out focus-within:outline-2 focus-within:outline-ink active:scale-[0.98]">
                  <span className="flex h-[54px] w-[54px] flex-none items-center justify-center rounded-btn bg-ink text-pink">
                    {preparing ? <Spinner size={22} /> : <CameraIcon size={26} />}
                  </span>
                  <span className="flex flex-1 flex-col gap-0.5">
                    <span className="text-[18px] font-extrabold">Take a photo</span>
                    <span className="text-[13px]">Up to 3: the plate, a side, the packaging</span>
                  </span>
                  <input
                    ref={cameraInput}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={(e) => void addFiles(e.target.files)}
                  />
                </label>
                <label className="flex min-h-[48px] cursor-pointer items-center justify-center rounded-tile border border-line text-[15px] font-semibold transition-transform duration-150 ease-out focus-within:outline-2 focus-within:outline-ink active:scale-[0.98]">
                  Choose from library
                  <input
                    ref={libraryInput}
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    onChange={(e) => void addFiles(e.target.files)}
                  />
                </label>
              </>
            ) : (
              <>
                <PhotoCarousel photos={carousel} onRemove={removePhoto} scrollTo={focus} />
                <div className="flex items-center gap-2" aria-label="Your photos">
                  <AnimatePresence initial={false}>
                    {photos.map((p, i) => (
                      <motion.div
                        key={p.key}
                        layout
                        initial={reduce ? { opacity: 0 } : { opacity: 0, transform: "scale(0.96)" }}
                        animate={{ opacity: 1, transform: "scale(1)" }}
                        exit={reduce ? { opacity: 0 } : { opacity: 0, transform: "scale(0.96)" }}
                        transition={{ duration: 0.18, ease: EASE_OUT, layout: SPRING_SNAPPY }}
                        className="relative"
                      >
                        <button
                          type="button"
                          onClick={() => setFocus(p.key)}
                          aria-label={`Show photo ${i + 1}`}
                          className={cn(
                            "block h-16 w-16 overflow-hidden rounded-[12px] border-2 transition-transform duration-150 ease-out active:scale-[0.97]",
                            focus === p.key ? "border-ink" : "border-transparent"
                          )}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
                          <img src={p.previewUrl} alt="" className="h-full w-full object-cover" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove photo ${i + 1}`}
                          onClick={() => removePhoto(p.key)}
                          className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-white"
                        >
                          <CloseIcon size={12} />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {photos.length < MAX_PHOTOS ? (
                    <>
                      <label
                        className="flex h-16 w-16 flex-none cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[12px] border-[1.5px] border-dashed border-dash text-[11px] font-semibold text-ink transition-transform duration-150 ease-out focus-within:outline-2 focus-within:outline-ink active:scale-[0.97]"
                        aria-label="Take another photo"
                      >
                        {preparing ? <Spinner size={18} /> : <CameraIcon size={20} />}
                        Camera
                        <input
                          ref={cameraInput}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="sr-only"
                          onChange={(e) => void addFiles(e.target.files)}
                        />
                      </label>
                      <label
                        className="flex h-16 w-16 flex-none cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[12px] border-[1.5px] border-dashed border-dash text-[11px] font-semibold text-ink transition-transform duration-150 ease-out focus-within:outline-2 focus-within:outline-ink active:scale-[0.97]"
                        aria-label="Add from library"
                      >
                        <PlusIcon size={20} />
                        Library
                        <input
                          ref={libraryInput}
                          type="file"
                          accept="image/*"
                          multiple
                          className="sr-only"
                          onChange={(e) => void addFiles(e.target.files)}
                        />
                      </label>
                    </>
                  ) : null}
                </div>
                <span className="text-[12px] text-muted">
                  {photos.length < MAX_PHOTOS
                    ? `${photos.length} of ${MAX_PHOTOS} photos. Add another angle, a side dish or the packaging.`
                    : `${MAX_PHOTOS} of ${MAX_PHOTOS} photos.`}
                </span>
              </>
            )}

            <label htmlFor="photo-note" className="text-[13px] font-semibold text-muted">
              Describe it <span className="font-normal">(optional)</span>
            </label>
            <textarea
              id="photo-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="Cooked in olive oil, half portion, 2 bites already eaten"
              className="rounded-tile border border-line bg-white px-3.5 py-3 text-[15px]"
            />
            {photos.length > 0 ? (
              <Button onClick={() => void estimate()} disabled={preparing}>
                Estimate from {photos.length} photo{photos.length === 1 ? "" : "s"}
              </Button>
            ) : null}
          </section>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              const text = note.trim()
              if (text.length < 3) return
              void est.run({ text })
            }}
          >
            <label htmlFor="describe" className="text-[13px] font-semibold text-muted">
              What did you eat?
            </label>
            <textarea
              id="describe"
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              maxLength={600}
              placeholder="Fish with rice, 1 plate, 2 big bites of fish, some curry"
              className="rounded-tile border border-line bg-white px-3.5 py-3 text-[16px] leading-[1.45]"
            />
            <span className="text-[12px] text-muted">Tip: use your keyboard&apos;s microphone to say it.</span>
            <Button type="submit" disabled={note.trim().length < 3}>
              Work it out
            </Button>
          </form>
        )
      ) : null}

      {busy && photos.length === 0 ? (
        <div role="status" className="flex items-center gap-2 rounded-card bg-white p-4 text-[15px]">
          <Spinner size={18} /> Working it out…
        </div>
      ) : null}

      {est.status === "error" && est.error ? (
        <div className="flex flex-col gap-2">
          <ErrorCard message={est.error} />
          <Link href={`/log/manual?${params.toString()}`} className="text-[14px] font-semibold text-protein">
            Enter it manually instead
          </Link>
        </div>
      ) : null}

      {hasResult ? (
        <>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <TitleInput value={est.title} onChange={est.setTitle} />
            </div>
            <IconChooser icon={pic.icon} onClick={pic.openPicker} size={48} />
          </div>
          <QuestionsCard
            questions={est.questions}
            answers={est.answers}
            onAnswer={est.answer}
            busy={est.status === "refining"}
          />
          <div className={est.status === "refining" ? "pointer-events-none opacity-60" : undefined}>
            <ItemsEditor items={est.items} onChange={est.setItems} label="What is on the plate" />
          </div>
          <TotalsRow items={est.items} />
          <CorrectionCard
            renamed={est.renamed}
            title={est.title}
            busy={est.status === "refining"}
            onRefine={est.refine}
          />
          {est.estimate ? (
            <p className="m-0 px-1 text-[12px] text-muted">
              Estimates are a starting point: check portions you know.
              {mode === "photo" && est.estimate.usage.photo_limit != null
                ? ` ${est.estimate.usage.photos_this_month} of ${est.estimate.usage.photo_limit} photo estimates used this month.`
                : ` ${est.estimate.usage.used_today} of ${est.estimate.usage.limit_today} AI estimates used today.`}
            </p>
          ) : null}
          <LogFooter
            mealLabel={target.label}
            saving={actions.saving}
            logging={actions.logging}
            saved={!!actions.savedId}
            disabled={est.status === "refining" || entryItems.length === 0}
            onSave={() => actions.save(est.title, entryItems, pic.icon)}
            onLog={() => actions.log(est.title, entryItems, pic.icon)}
          />
          {pic.sheet}
        </>
      ) : (
        <div className="pb-safe" />
      )}
    </main>
  )
}
