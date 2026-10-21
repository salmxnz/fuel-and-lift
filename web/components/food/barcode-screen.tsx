"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { toast } from "sonner"
import { Button, Field, PageHeader, Spinner, TextInput } from "@/components/ui/primitives"
import { BarcodeIcon } from "@/components/ui/icons"
import { ApiError, api, errorMessage, seg } from "@/lib/api/client"
import type { EntryDayResponse, Food, FoodResponse } from "@/lib/api/types"
import { kcal, num1, parseDecimal } from "@/lib/format"
import { targetBody, targetFromParams } from "@/lib/meal-target"

// Minimal typing for the Shape Detection API (not in TS's DOM lib yet).
type DetectedBarcode = { rawValue: string; format: string }
type BarcodeDetectorLike = { detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]> }
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike

function getDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null
  return ((window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector ?? null)
}

const subscribeNoop = () => () => {}

export function BarcodeScreen() {
  const params = useSearchParams()
  const router = useRouter()
  const target = useMemo(() => targetFromParams(new URLSearchParams(params.toString())), [params])
  const canScan = useSyncExternalStore(subscribeNoop, () => !!getDetectorCtor() && !!navigator.mediaDevices?.getUserMedia, () => false)

  const [code, setCode] = useState("")
  const [scanning, setScanning] = useState(false)
  const [looking, setLooking] = useState(false)
  const [notFound, setNotFound] = useState<string | null>(null)
  const [food, setFood] = useState<Food | null>(null)
  const [grams, setGrams] = useState("")
  const [saving, setSaving] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const timer = useRef<number | null>(null)

  const stopCamera = useCallback(() => {
    if (timer.current) window.clearInterval(timer.current)
    timer.current = null
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    setScanning(false)
  }, [])

  useEffect(() => stopCamera, [stopCamera])

  const lookup = useCallback(async (raw: string) => {
    const clean = raw.replace(/\D/g, "")
    if (clean.length < 6 || clean.length > 14) {
      toast.error("Barcodes are 8 to 14 digits.")
      return
    }
    setLooking(true)
    setNotFound(null)
    setFood(null)
    try {
      const res = await api.get<FoodResponse>(`foods/barcode/${seg(clean)}`)
      setFood(res.food)
      setGrams(String(res.food.serving_grams ?? 100))
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(clean)
      else toast.error(errorMessage(err))
    } finally {
      setLooking(false)
    }
  }, [])

  async function startCamera() {
    const Ctor = getDetectorCtor()
    if (!Ctor) return
    try {
      const detector = new Ctor({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] })
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      stream.current = media
      setScanning(true)
      requestAnimationFrame(async () => {
        if (!video.current) return
        video.current.srcObject = media
        await video.current.play().catch(() => undefined)
        timer.current = window.setInterval(async () => {
          if (!video.current || video.current.readyState < 2) return
          try {
            const found = await detector.detect(video.current)
            const hit = found.find((b) => /^\d{6,14}$/.test(b.rawValue))
            if (hit) {
              stopCamera()
              navigator.vibrate?.(40)
              setCode(hit.rawValue)
              void lookup(hit.rawValue)
            }
          } catch {
            /* keep scanning */
          }
        }, 250)
      })
    } catch {
      stopCamera()
      toast.error("Couldn't open the camera. Type the number instead.")
    }
  }

  const g = parseDecimal(grams) ?? 0
  const f = g / 100

  async function log() {
    if (!food || g <= 0) return
    setSaving(true)
    try {
      await api.post<EntryDayResponse>(`days/${seg(target.date)}/entries`, {
        ...targetBody(target),
        name: food.brand ? `${food.name} (${food.brand})` : food.name,
        origin: "barcode",
        items: [
          {
            name: food.name,
            grams: Math.round(g),
            kcal: Math.round(food.per_100g.kcal * f),
            protein_g: Math.round(food.per_100g.protein_g * f * 10) / 10,
            carbs_g: Math.round(food.per_100g.carbs_g * f * 10) / 10,
            fat_g: Math.round(food.per_100g.fat_g * f * 10) / 10,
            assumption: food.serving_name,
            source: "database",
          },
        ],
      })
      toast.success(`Logged to ${target.label}`)
      router.push(`/today?date=${target.date}`)
    } catch (err) {
      toast.error(errorMessage(err))
      setSaving(false)
    }
  }

  return (
    <main className="app-column pb-safe flex min-h-dvh flex-col gap-4">
      <PageHeader back="history" eyebrow={target.label} title="Scan barcode" titleClassName="text-[20px]" />

      {scanning ? (
        <div className="relative overflow-hidden rounded-card bg-ink">
          <video ref={video} playsInline muted className="block aspect-[4/3] w-full object-cover" aria-label="Camera preview" />
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-lime" />
          <Button variant="white" size="sm" onClick={stopCamera} className="absolute bottom-3 right-3">
            Stop
          </Button>
        </div>
      ) : canScan ? (
        <Button variant="lime" onClick={startCamera} className="rounded-[20px]">
          <BarcodeIcon size={24} /> Scan with camera
        </Button>
      ) : (
        <p className="m-0 rounded-tile border-[1.5px] border-dashed border-dash p-3.5 text-[14px] text-muted">
          This browser can&apos;t scan barcodes with the camera. Type the number printed under the bars.
        </p>
      )}

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void lookup(code)
        }}
      >
        <Field label="Barcode number" htmlFor="bc" className="flex-1">
          <TextInput
            id="bc"
            inputMode="numeric"
            autoComplete="off"
            value={code}
            maxLength={14}
            placeholder="5012345678900"
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
        </Field>
        <Button type="submit" size="md" disabled={code.length < 6 || looking}>
          {looking ? <Spinner size={16} /> : "Look up"}
        </Button>
      </form>

      {notFound ? (
        <div className="flex flex-col gap-2 rounded-card bg-white p-4">
          <span className="text-[15px] font-semibold">No product found for {notFound}</span>
          <Link href={`/log/manual?${params.toString()}`} className="text-[14px] font-semibold text-protein">
            Enter it manually
          </Link>
        </div>
      ) : null}

      {food ? (
        <section aria-label={food.name} className="flex flex-col gap-3 rounded-card bg-white p-4">
          <div className="flex flex-col gap-0.5">
            {food.brand ? <span className="text-[12px] text-muted">{food.brand}</span> : null}
            <h2 className="m-0 text-[19px] font-extrabold tracking-[-0.01em]">{food.name}</h2>
            <span className="text-[13px] text-muted">
              Per 100 g: {kcal(food.per_100g.kcal)} kcal, {num1(food.per_100g.protein_g)} g protein
            </span>
          </div>
          <Field
            label="How much?"
            htmlFor="bc-grams"
            hint={food.serving_name && food.serving_grams ? `1 ${food.serving_name} = ${food.serving_grams} g` : undefined}
          >
            <div className="flex items-center gap-2">
              <TextInput id="bc-grams" inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} />
              <span className="text-[15px] text-muted">g</span>
            </div>
          </Field>
          <div className="grid grid-cols-4 gap-2 text-[13px]" aria-live="polite">
            <Stat label="kcal" value={kcal(food.per_100g.kcal * f)} />
            <Stat label="Protein" value={`${num1(food.per_100g.protein_g * f)} g`} />
            <Stat label="Carbs" value={`${num1(food.per_100g.carbs_g * f)} g`} />
            <Stat label="Fat" value={`${num1(food.per_100g.fat_g * f)} g`} />
          </div>
          <Button onClick={log} loading={saving} disabled={g <= 0}>
            Log {target.label.toLowerCase()}
          </Button>
        </section>
      ) : null}
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-muted">{label}</span>
      <span className="text-[16px] font-bold">{value}</span>
    </div>
  )
}
