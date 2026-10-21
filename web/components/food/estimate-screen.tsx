"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Button, ErrorCard, PageHeader, Spinner } from "@/components/ui/primitives"
import { CameraIcon } from "@/components/ui/icons"
import { prepareImage, type PreparedImage } from "@/lib/image"
import { targetFromParams } from "@/lib/meal-target"
import { toEntryItems } from "@/lib/items"
import { ItemsEditor, TotalsRow } from "./items-editor"
import { LogFooter, QuestionsCard, TitleInput } from "./estimate-parts"
import { useEstimate, useLogActions } from "./use-estimate"

/** AI-Estimate.dc.html for both "Take a photo" and "Describe it". */
export function EstimateScreen({ mode }: { mode: "photo" | "text" }) {
  const params = useSearchParams()
  const target = useMemo(() => targetFromParams(new URLSearchParams(params.toString())), [params])
  const est = useEstimate(mode)
  const actions = useLogActions({ target, origin: "ai", estimateId: est.estimate?.estimate_id })
  const [photo, setPhoto] = useState<PreparedImage | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [note, setNote] = useState("")
  const cameraInput = useRef<HTMLInputElement>(null)
  const libraryInput = useRef<HTMLInputElement>(null)

  // Free the preview's object URL when it changes or we leave.
  useEffect(() => {
    if (!photo) return
    return () => URL.revokeObjectURL(photo.previewUrl)
  }, [photo])

  async function onFile(file: File | undefined) {
    if (!file) return
    setPreparing(true)
    try {
      const prepared = await prepareImage(file)
      setPhoto(prepared)
      await est.run({ image: { media_type: prepared.mediaType, data: prepared.data }, text: note.trim() || undefined })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't use that photo.")
    } finally {
      setPreparing(false)
      if (cameraInput.current) cameraInput.current.value = ""
      if (libraryInput.current) libraryInput.current.value = ""
    }
  }

  const hasResult = est.status === "ready" || est.status === "refining"
  const busy = est.status === "loading" || preparing
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

      {photo ? (
        <figure className="relative m-0 h-[172px] overflow-hidden rounded-card bg-[#553646]">
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
          <img src={photo.previewUrl} alt={`Your ${target.label.toLowerCase()} photo`} className="h-full w-full object-cover" />
          {busy ? (
            <figcaption className="absolute inset-0 flex items-center justify-center gap-2 bg-[rgba(46,26,36,0.55)] text-[15px] font-semibold text-white">
              <Spinner size={18} /> Finding each item…
            </figcaption>
          ) : null}
        </figure>
      ) : null}

      {!hasResult && !busy ? (
        mode === "photo" ? (
          <section className="flex flex-col gap-3">
            <label htmlFor="photo-note" className="text-[13px] font-semibold text-muted">
              Anything the photo won&apos;t show? <span className="font-normal">(optional)</span>
            </label>
            <textarea
              id="photo-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="Cooked in ghee, 2 big bites of fish already eaten"
              className="rounded-tile border border-line bg-white px-3.5 py-3 text-[15px]"
            />
            <label className="flex cursor-pointer items-center gap-3.5 rounded-[20px] border border-[rgba(46,26,36,0.12)] bg-pink p-4 text-ink focus-within:outline-2 focus-within:outline-ink">
              <span className="flex h-[54px] w-[54px] flex-none items-center justify-center rounded-btn bg-ink text-pink">
                <CameraIcon size={26} />
              </span>
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-[18px] font-extrabold">{photo ? "Take another photo" : "Take a photo"}</span>
                <span className="text-[13px]">I find each item, you check the numbers</span>
              </span>
              <input
                ref={cameraInput}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </label>
            <label className="flex min-h-[48px] cursor-pointer items-center justify-center rounded-tile border border-line text-[15px] font-semibold focus-within:outline-2 focus-within:outline-ink">
              Choose from library
              <input
                ref={libraryInput}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </label>
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

      {busy && !photo ? (
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
          <TitleInput value={est.title} onChange={est.setTitle} />
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
            onSave={() => actions.save(est.title, entryItems)}
            onLog={() => actions.log(est.title, entryItems)}
          />
        </>
      ) : (
        <div className="pb-safe" />
      )}
    </main>
  )
}
