"use client"

import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"
import { CheckIcon } from "@/components/ui/icons"
import { Button, ErrorCard, PageHeader, Skeleton } from "@/components/ui/primitives"
import { api, errorMessage, seg } from "@/lib/api/client"
import type { ListedPhoto, PhotosResponse } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { cn } from "@/lib/cn"
import { formatDayMonth } from "@/lib/dates"

/** Me → Meal photos: every kept photo, newest first; select some and delete. */
export function PhotosScreen() {
  const res = useApi<PhotosResponse>("photos")
  const [more, setMore] = useState<ListedPhoto[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [exhausted, setExhausted] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const data = res.data
  const photos = [...(data?.photos ?? []), ...more]
  const stored = data?.stored ?? 0
  const limit = data?.limit ?? null

  async function loadMore() {
    const last = photos[photos.length - 1]
    if (!last) return
    setLoadingMore(true)
    try {
      const next = await api.get<PhotosResponse>(`photos?before=${encodeURIComponent(last.created_at)}`)
      setMore((m) => [...m, ...next.photos])
      if (next.photos.length === 0) setExhausted(true)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setLoadingMore(false)
    }
  }

  function toggle(id: string) {
    setConfirming(false)
    setPicked((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  async function deletePicked() {
    if (!confirming) {
      setConfirming(true)
      return
    }
    setDeleting(true)
    let done = 0
    for (const id of picked) {
      try {
        await api.del(`photos/${seg(id)}`)
        done++
      } catch (err) {
        toast.error(errorMessage(err))
        break
      }
    }
    toast.success(`Deleted ${done} photo${done === 1 ? "" : "s"}. The meals stay logged.`)
    setPicked(new Set())
    setSelecting(false)
    setConfirming(false)
    setDeleting(false)
    setMore([])
    setExhausted(false)
    void res.reload()
  }

  return (
    <main className="app-column pb-safe flex min-h-dvh flex-col gap-3">
      <PageHeader
        back="/me"
        backLabel="Back to Me"
        title="Meal photos"
        right={
          photos.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setSelecting((v) => !v)
                setPicked(new Set())
                setConfirming(false)
              }}
              className="min-h-[44px] rounded-[12px] px-3 text-[15px] font-semibold text-protein transition-transform duration-150 ease-out active:scale-[0.97]"
            >
              {selecting ? "Done" : "Select"}
            </button>
          ) : undefined
        }
      />

      {data?.enabled && limit != null ? (
        <section aria-label="Photo storage" className="flex flex-col gap-2 rounded-card bg-white p-3.5">
          <div className="flex items-baseline justify-between text-[14px]">
            <span className="font-semibold">
              {stored} of {limit} photos kept
            </span>
            {stored >= limit ? (
              <Link href="/pro" className="text-[13px] font-semibold text-protein">
                Go Pro for unlimited
              </Link>
            ) : null}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-line-soft">
            <div
              className={cn("h-full origin-left rounded-full transition-transform duration-300 ease-out", stored >= limit ? "bg-protein" : "bg-pink")}
              style={{ transform: `scaleX(${Math.min(1, stored / Math.max(1, limit))})` }}
            />
          </div>
          <span className="text-[12px] text-muted">
            {stored >= limit
              ? "Storage is full: new meals still log, but their photos aren't kept. Delete old ones to make room."
              : "Free plans keep your latest photos up to this limit. Deleting a photo keeps the meal and its numbers."}
          </span>
        </section>
      ) : null}

      {res.error && !data ? <ErrorCard message={res.error.message} onRetry={() => void res.reload()} /> : null}
      {!data && !res.error ? (
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 9 }, (_, i) => (
            <Skeleton key={i} className="aspect-square rounded-[12px]" />
          ))}
        </div>
      ) : null}

      {data && photos.length === 0 ? (
        <div className="rounded-card border-[1.5px] border-dashed border-dash p-4 text-[15px] text-muted">
          {data.enabled
            ? "No photos yet. Photos of meals you log from the camera show up here."
            : "Photo storage isn't set up on this server, so meal photos aren't kept."}
        </div>
      ) : null}

      {photos.length > 0 ? (
        <ul aria-label="Photos" className="m-0 grid list-none grid-cols-3 gap-1.5 p-0">
          {photos.map((p) => {
            const on = picked.has(p.id)
            const label = `${p.entry.name}, ${formatDayMonth(p.entry.date)}`
            return (
              <li key={p.id} className="relative">
                {selecting ? (
                  <button
                    type="button"
                    aria-pressed={on}
                    aria-label={label}
                    onClick={() => toggle(p.id)}
                    className="relative block w-full overflow-hidden rounded-[12px] transition-transform duration-150 ease-out active:scale-[0.97]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed R2 link */}
                    <img src={p.url} alt="" className={cn("aspect-square w-full object-cover", on && "opacity-70")} />
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white",
                        on ? "bg-ink text-white" : "bg-[rgba(46,26,36,0.25)]"
                      )}
                    >
                      {on ? <CheckIcon size={14} strokeWidth={2.6} /> : null}
                    </span>
                  </button>
                ) : (
                  <Link href={`/today?date=${p.entry.date}`} aria-label={label} className="block overflow-hidden rounded-[12px]">
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed R2 link */}
                    <img src={p.url} alt="" className="aspect-square w-full object-cover" />
                  </Link>
                )}
                <span className="pointer-events-none absolute inset-x-1.5 bottom-1.5 truncate rounded-[8px] bg-[rgba(46,26,36,0.55)] px-1.5 py-0.5 text-[11px] font-semibold text-white">
                  {formatDayMonth(p.entry.date)}
                </span>
              </li>
            )
          })}
        </ul>
      ) : null}

      {data && photos.length >= 60 && !exhausted ? (
        <Button variant="ghost" size="md" onClick={loadMore} loading={loadingMore}>
          Show older photos
        </Button>
      ) : null}

      {selecting && picked.size > 0 ? (
        <div className="sticky bottom-0 -mx-4 mt-auto bg-gradient-to-t from-ground from-70% to-transparent px-4 pt-4" style={{ paddingBottom: "calc(var(--safe-bottom) + 20px)" }}>
          <Button variant="danger" onClick={deletePicked} loading={deleting} className="w-full bg-white">
            {confirming ? `Tap again to delete ${picked.size}` : `Delete ${picked.size} photo${picked.size === 1 ? "" : "s"}`}
          </Button>
        </div>
      ) : null}
    </main>
  )
}
