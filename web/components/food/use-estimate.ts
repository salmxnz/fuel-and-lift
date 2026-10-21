"use client"

import { useRouter } from "next/navigation"
import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"
import { ApiError, api, errorMessage, seg } from "@/lib/api/client"
import type {
  EntryDayResponse,
  EntryItem,
  EntryOrigin,
  EstimateKind,
  EstimateQuestion,
  MealEstimateRequest,
  MealEstimateResponse,
  SavedMealResponse,
} from "@/lib/api/types"
import { fromEntryItem, toEntryItems, type EditableItem } from "@/lib/items"
import { targetBody, type MealTarget } from "@/lib/meal-target"

export type EstimateStatus = "idle" | "loading" | "refining" | "ready" | "error"

/**
 * Calls POST /v1/ai/meal-estimate and keeps the editable result. Handles the
 * contract's special statuses: 402 photo limit → paywall, 429 → toast,
 * 503 → "AI isn't set up yet", 502 → upstream failure.
 */
export function useEstimate(kind: EstimateKind) {
  const router = useRouter()
  const [status, setStatus] = useState<EstimateStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [estimate, setEstimate] = useState<MealEstimateResponse | null>(null)
  const [items, setItems] = useState<EditableItem[]>([])
  const [title, setTitle] = useState("")
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [questions, setQuestions] = useState<EstimateQuestion[]>([])
  const answersRef = useRef<Record<string, string>>({})
  // The user's edits win over the AI: a refine keeps their name for the dish
  // and sends their edited items so the new estimate builds on them.
  const titleRef = useRef("")
  const titleEditedRef = useRef(false)
  const [titleEdited, setTitleEdited] = useState(false)
  const itemsRef = useRef<EditableItem[]>([])
  const itemsEditedRef = useRef(false)

  const handleError = useCallback(
    (err: unknown, keepResult: boolean) => {
      if (err instanceof ApiError) {
        if (err.status === 402 || err.code === "photo_limit") {
          router.push("/pro?reason=photo_limit")
          setStatus(keepResult ? "ready" : "idle")
          return
        }
        if (err.status === 429) {
          toast.error(
            err.code === "rate_day"
              ? "You've used today's AI estimates. Enter it manually, or try again tomorrow."
              : "That's a lot of estimates in a minute. Wait a moment and try again."
          )
          setStatus(keepResult ? "ready" : "idle")
          return
        }
        if (err.status === 503) {
          setError(
            err.code === "ai_budget"
              ? "AI estimates are paused for now. You can still enter it manually."
              : "AI isn't set up yet. You can still enter it manually."
          )
          setStatus(keepResult ? "ready" : "error")
          return
        }
        if (err.status === 502) {
          const msg = "The AI couldn't work that out. Try again, or enter it manually."
          if (keepResult) toast.error(msg)
          else setError(msg)
          setStatus(keepResult ? "ready" : "error")
          return
        }
      }
      if (keepResult) toast.error(errorMessage(err))
      else setError(errorMessage(err))
      setStatus(keepResult ? "ready" : "error")
    },
    [router]
  )

  const apply = useCallback((res: MealEstimateResponse) => {
    setEstimate(res)
    const next = res.items.map((it) => fromEntryItem(it))
    itemsRef.current = next
    itemsEditedRef.current = false
    setItems(next)
    if (!titleEditedRef.current) {
      titleRef.current = res.title
      setTitle(res.title)
    }
    const answered = { ...answersRef.current }
    setQuestions((prev) => {
      // Keep answered questions on screen so the chosen chip stays visible.
      const byId = new Map(prev.filter((q) => q.id in answered).map((q) => [q.id, q]))
      for (const q of res.questions) byId.set(q.id, q)
      return Array.from(byId.values())
    })
    setStatus("ready")
  }, [])

  const run = useCallback(
    async (input: { text?: string; images?: MealEstimateRequest["images"] }) => {
      setStatus("loading")
      setError(null)
      setAnswers({})
      answersRef.current = {}
      setQuestions([])
      titleEditedRef.current = false
      setTitleEdited(false)
      try {
        const body: MealEstimateRequest = {
          kind,
          ...(input.text ? { text: input.text } : {}),
          ...(input.images?.length ? { images: input.images } : {}),
        }
        apply(await api.post<MealEstimateResponse>("ai/meal-estimate", body))
      } catch (err) {
        handleError(err, false)
      }
    },
    [kind, apply, handleError]
  )

  /**
   * Re-runs the AI on the current estimate. The image and text aren't re-sent:
   * previous_estimate_id carries them (and any earlier correction).
   */
  const refine = useCallback(
    async (correction?: string) => {
      if (!estimate) return
      setStatus("refining")
      try {
        const body: MealEstimateRequest = {
          kind,
          answers: answersRef.current,
          previous_estimate_id: estimate.estimate_id,
          ...(titleEditedRef.current && titleRef.current.trim() ? { title: titleRef.current.trim() } : {}),
          ...(itemsEditedRef.current
            ? {
                items: toEntryItems(itemsRef.current).map(({ name, grams, kcal, protein_g, carbs_g, fat_g }) => ({
                  name,
                  grams,
                  kcal,
                  protein_g,
                  carbs_g,
                  fat_g,
                })),
              }
            : {}),
          ...(correction?.trim() ? { correction: correction.trim() } : {}),
        }
        apply(await api.post<MealEstimateResponse>("ai/meal-estimate", body))
      } catch (err) {
        handleError(err, true)
      }
    },
    [estimate, kind, apply, handleError]
  )

  const answer = useCallback(
    async (questionId: string, optionId: string) => {
      const next = { ...answersRef.current, [questionId]: optionId }
      answersRef.current = next
      setAnswers(next)
      await refine()
    },
    [refine]
  )

  const editTitle = useCallback((v: string) => {
    titleRef.current = v
    titleEditedRef.current = true
    setTitleEdited(true)
    setTitle(v)
  }, [])

  const editItems = useCallback((next: EditableItem[]) => {
    itemsRef.current = next
    itemsEditedRef.current = true
    setItems(next)
  }, [])

  const reset = useCallback(() => {
    setStatus("idle")
    setError(null)
    setEstimate(null)
    setItems([])
    setTitle("")
    titleRef.current = ""
    titleEditedRef.current = false
    setTitleEdited(false)
    itemsRef.current = []
    itemsEditedRef.current = false
    setAnswers({})
    answersRef.current = {}
    setQuestions([])
  }, [])

  /** True when the user renamed the dish away from the AI's title. */
  const renamed = titleEdited && !!estimate && title.trim() !== "" && title.trim() !== estimate.title.trim()

  return {
    status,
    error,
    estimate,
    items,
    setItems: editItems,
    title,
    setTitle: editTitle,
    renamed,
    answers,
    questions,
    run,
    answer,
    refine,
    reset,
    setError,
  }
}

/** "Log <meal>" and "Save to my meals" for an edited list of items. */
export function useLogActions({
  target,
  origin,
  estimateId,
}: {
  target: MealTarget
  origin: EntryOrigin
  estimateId?: string | null
}) {
  const router = useRouter()
  const [logging, setLogging] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)

  const log = useCallback(
    async (name: string, items: EntryItem[]) => {
      if (items.length === 0) {
        toast.error("Add at least one item first.")
        return
      }
      setLogging(true)
      try {
        const res = await api.post<EntryDayResponse>(`days/${seg(target.date)}/entries`, {
          ...targetBody(target),
          name: name.trim() || items[0].name,
          origin,
          ...(estimateId ? { ai_estimate_id: estimateId } : {}),
          items,
        })
        const skipped = res.photos_skipped ?? 0
        if (skipped > 0) {
          toast(`Logged to ${target.label}. ${skipped === 1 ? "The photo wasn't" : `${skipped} photos weren't`} kept: photo storage is full.`, {
            action: { label: "Make room", onClick: () => router.push("/photos") },
            duration: 6000,
          })
        } else {
          toast.success(`Logged to ${target.label}`)
        }
        router.push(`/today?date=${target.date}`)
      } catch (err) {
        toast.error(errorMessage(err))
        setLogging(false)
      }
    },
    [target, origin, estimateId, router]
  )

  const save = useCallback(
    async (name: string, items: EntryItem[]) => {
      if (items.length === 0) {
        toast.error("Add at least one item first.")
        return
      }
      setSaving(true)
      try {
        const res = await api.post<SavedMealResponse>("saved-meals", {
          name: name.trim() || items[0].name,
          default_meal_slot_id: target.mealSlotId,
          items: items.map((it) => ({ ...it, is_addon: false })),
        })
        setSavedId(res.saved_meal.id)
        toast.success(`Saved “${res.saved_meal.name}” to My meals`)
      } catch (err) {
        toast.error(errorMessage(err))
      } finally {
        setSaving(false)
      }
    },
    [target]
  )

  return { log, save, logging, saving, savedId }
}

export { toEntryItems }
