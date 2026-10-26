"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Sheet } from "@/components/ui/sheet"
import { Button, Chip, ErrorCard, PageHeader, Skeleton } from "@/components/ui/primitives"
import { CameraIcon, ChatIcon, CloseIcon, PlusIcon } from "@/components/ui/icons"
import { api, errorMessage } from "@/lib/api/client"
import type { Feedback, FeedbackKind, FeedbackListResponse, FeedbackResponse, FeedbackStatus } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { cn } from "@/lib/cn"
import { relativeDay } from "@/lib/dates"
import { prepareImage, type PreparedImage } from "@/lib/image"

// Me → Feedback: everything you've sent (with the team's reply when there is
// one) and a New button. Screenshots go to the photo bucket with it.

const KINDS: { value: FeedbackKind; label: string }[] = [
  { value: "bug", label: "Something's broken" },
  { value: "idea", label: "An idea" },
  { value: "other", label: "Something else" },
]

const KIND_LABEL: Record<FeedbackKind, string> = { bug: "Bug", idea: "Idea", other: "Other" }

const STATUS: Record<FeedbackStatus, { label: string; className: string }> = {
  new: { label: "Sent", className: "bg-chip text-ink" },
  seen: { label: "Seen", className: "bg-pink-soft text-ink" },
  done: { label: "Done", className: "bg-mint text-ink" },
}

const MAX_IMAGES = 3

export function FeedbackScreen() {
  const list = useApi<FeedbackListResponse>("feedback")
  const [open, setOpen] = useState(false)
  const [viewing, setViewing] = useState<string | null>(null)
  const items = list.data?.feedback ?? []

  return (
    <main className="app-column pb-safe flex min-h-dvh flex-col gap-3">
      <PageHeader
        back="/me"
        title="Feedback"
        right={
          <Button size="sm" onClick={() => setOpen(true)}>
            <PlusIcon size={16} /> New
          </Button>
        }
      />

      {list.error && !list.data ? (
        <ErrorCard message={list.error.message} onRetry={() => void list.reload()} />
      ) : list.loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-24 rounded-card" />
          <Skeleton className="h-24 rounded-card" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card bg-white px-5 py-8 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-pink-soft">
            <ChatIcon size={26} />
          </span>
          <p className="m-0 text-[17px] font-extrabold">Tell us what to fix or build</p>
          <p className="m-0 text-[14px] text-muted">A bug, an idea, anything. Add a screenshot if it helps. We read every one.</p>
          <Button size="md" onClick={() => setOpen(true)}>
            <PlusIcon size={18} /> New feedback
          </Button>
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {items.map((f) => (
            <FeedbackCard key={f.id} f={f} onPhoto={setViewing} />
          ))}
        </ul>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title="New feedback" description="What happened, or what you'd like. Screenshots help.">
        {open ? (
          <NewFeedback
            onSent={(f) => {
              list.setData((prev) => ({ feedback: [f, ...(prev?.feedback ?? [])] }))
              setOpen(false)
              toast.success("Thanks! We got it.")
            }}
          />
        ) : null}
      </Sheet>

      <Sheet open={viewing != null} onClose={() => setViewing(null)} title="Screenshot">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed link from the API */}
        {viewing ? <img src={viewing} alt="Your screenshot" className="max-h-[70dvh] w-full rounded-card object-contain" /> : null}
      </Sheet>
    </main>
  )
}

function FeedbackCard({ f, onPhoto }: { f: Feedback; onPhoto: (url: string) => void }) {
  const s = STATUS[f.status]
  return (
    <li className="flex flex-col gap-2 rounded-card bg-white p-3.5">
      <div className="flex items-center justify-between gap-2 text-[12.5px]">
        <span className="font-semibold text-muted">
          {KIND_LABEL[f.kind]} · {relativeDay(f.created_at)}
        </span>
        <span className={cn("rounded-full px-2 py-0.5 text-[11.5px] font-bold", s.className)}>{s.label}</span>
      </div>
      <p className="m-0 whitespace-pre-wrap text-[15px] leading-snug">{f.message}</p>
      {f.photos.length > 0 ? (
        <div className="flex gap-2">
          {f.photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPhoto(p.url)}
              aria-label={`Screenshot ${i + 1}`}
              className="h-16 w-16 flex-none overflow-hidden rounded-tile bg-field"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- signed link from the API */}
              <img src={p.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
      {f.admin_note ? (
        <p className="m-0 rounded-tile bg-pink-soft/60 px-3 py-2 text-[14px]">
          <span className="font-bold">adebite: </span>
          {f.admin_note}
        </p>
      ) : null}
    </li>
  )
}

/** The screen they came from, so we know where the problem is. */
function fromPage(): string | null {
  try {
    if (!document.referrer) return null
    const u = new URL(document.referrer)
    return u.origin === window.location.origin && u.pathname !== "/feedback" ? u.pathname : null
  } catch {
    return null
  }
}

function NewFeedback({ onSent }: { onSent: (f: Feedback) => void }) {
  const [kind, setKind] = useState<FeedbackKind>("bug")
  const [message, setMessage] = useState("")
  const [images, setImages] = useState<PreparedImage[]>([])
  const [adding, setAdding] = useState(false)
  const [sending, setSending] = useState(false)

  async function add(files: FileList | null) {
    if (!files?.length) return
    setAdding(true)
    try {
      const room = MAX_IMAGES - images.length
      const picked = Array.from(files).slice(0, room)
      // Screenshots have small text: keep them sharper than meal photos.
      const prepared = await Promise.all(picked.map((f) => prepareImage(f, { maxSide: 1600 })))
      setImages((prev) => [...prev, ...prepared])
      if (files.length > room) toast(`Up to ${MAX_IMAGES} images`)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setAdding(false)
    }
  }

  function remove(i: number) {
    setImages((prev) => {
      URL.revokeObjectURL(prev[i].previewUrl)
      return prev.filter((_, j) => j !== i)
    })
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    setSending(true)
    try {
      const res = await api.post<FeedbackResponse>("feedback", {
        kind,
        message: message.trim(),
        page: fromPage(),
        images: images.map((i) => ({ media_type: i.mediaType, data: i.data })),
      })
      images.forEach((i) => URL.revokeObjectURL(i.previewUrl))
      onSent(res.feedback)
    } catch (err) {
      toast.error(errorMessage(err))
      setSending(false)
    }
  }

  return (
    <form onSubmit={send} className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="What is it" className="flex flex-wrap gap-1.5">
        {KINDS.map((k) => (
          <Chip key={k.value} selected={kind === k.value} onClick={() => setKind(k.value)}>
            {k.label}
          </Chip>
        ))}
      </div>

      <label htmlFor="fb-message" className="sr-only">
        Description
      </label>
      <textarea
        id="fb-message"
        data-autofocus
        rows={5}
        maxLength={2000}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={kind === "bug" ? "What happened, and what did you expect?" : kind === "idea" ? "What would make adebite better for you?" : "Tell us anything"}
        className="min-h-[120px] resize-none rounded-tile border border-line bg-white px-3.5 py-3 text-[15px] outline-none focus:border-[1.5px] focus:border-ink"
      />

      <div className="flex flex-wrap items-center gap-2">
        {images.map((img, i) => (
          <span key={img.previewUrl} className="relative h-[72px] w-[72px] flex-none">
            {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
            <img src={img.previewUrl} alt={`Image ${i + 1}`} className="h-full w-full rounded-tile object-cover" />
            <button
              type="button"
              aria-label={`Remove image ${i + 1}`}
              onClick={() => remove(i)}
              className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-ink text-white"
            >
              <CloseIcon size={14} />
            </button>
          </span>
        ))}
        {images.length < MAX_IMAGES ? (
          <label
            className={cn(
              "flex h-[72px] min-w-[72px] cursor-pointer flex-col items-center justify-center gap-1 rounded-tile border-[1.5px] border-dashed border-dash px-3 text-[12px] font-semibold focus-within:outline-2 focus-within:outline-ink",
              adding && "pointer-events-none opacity-60"
            )}
          >
            <CameraIcon size={20} />
            {images.length ? "Add" : "Attach image"}
            <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => void add(e.target.files)} />
          </label>
        ) : null}
      </div>

      <Button type="submit" loading={sending} disabled={!message.trim() || adding}>
        Send feedback
      </Button>
    </form>
  )
}
