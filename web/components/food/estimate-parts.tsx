"use client"

import { useState } from "react"
import type { EstimateQuestion } from "@/lib/api/types"
import { Button, Chip, Spinner } from "@/components/ui/primitives"
import { PencilIcon } from "@/components/ui/icons"

export function QuestionsCard({
  questions,
  answers,
  onAnswer,
  busy,
}: {
  questions: EstimateQuestion[]
  answers: Record<string, string>
  onAnswer: (questionId: string, optionId: string) => void
  busy: boolean
}) {
  if (questions.length === 0) return null
  return (
    <section aria-label="Questions" className="flex flex-col gap-2.5 rounded-card bg-white px-3.5 py-3">
      {questions.map((q) => {
        const id = `q-${q.id}`
        return (
          <div key={q.id} className="flex flex-col gap-1.5">
            <span id={id} className="text-[13px] font-semibold">
              {q.text}
            </span>
            <div role="radiogroup" aria-labelledby={id} className="flex flex-wrap gap-1.5">
              {q.options.map((o) => (
                <Chip
                  key={o.id}
                  tone="pink"
                  selected={answers[q.id] === o.id}
                  disabled={busy}
                  onClick={() => onAnswer(q.id, o.id)}
                  className={answers[q.id] === o.id ? "" : "bg-transparent"}
                >
                  {o.label}
                </Chip>
              ))}
            </div>
          </div>
        )
      })}
      {busy ? (
        <span role="status" className="flex items-center gap-2 text-[13px] text-muted">
          <Spinner size={14} /> Updating the numbers…
        </span>
      ) : null}
    </section>
  )
}

export function TitleInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-tile bg-white px-3.5">
      <span className="sr-only">Meal name</span>
      <input
        value={value}
        maxLength={80}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Name this meal"
        className="min-h-[48px] min-w-0 flex-1 bg-transparent text-[17px] font-bold outline-none"
      />
      <PencilIcon size={16} className="text-muted" />
    </label>
  )
}

/** "Save to my meals" + "Log <meal>" pinned to the bottom of the flow. */
export function LogFooter({
  mealLabel,
  onSave,
  onLog,
  saving,
  logging,
  saved,
  disabled,
}: {
  mealLabel: string
  onSave: () => void
  onLog: () => void
  saving: boolean
  logging: boolean
  saved: boolean
  disabled?: boolean
}) {
  return (
    <div
      className="sticky bottom-0 -mx-4 mt-auto grid grid-cols-2 gap-2 bg-gradient-to-t from-ground from-70% to-transparent px-4 pt-4"
      style={{ paddingBottom: "calc(var(--safe-bottom) + 20px)" }}
    >
      <Button variant="outline" size="lg" className="min-h-[54px] px-3 text-[15px]" onClick={onSave} loading={saving} disabled={disabled || saved || logging}>
        {saved ? "Saved" : "Save to my meals"}
      </Button>
      <Button size="lg" className="min-h-[54px] px-3 text-[15px]" onClick={onLog} loading={logging} disabled={disabled || saving}>
        Log {mealLabel.toLowerCase()}
      </Button>
    </div>
  )
}

/**
 * After an estimate: tell the AI what it got wrong ("cooked in oil only, no
 * butter") and get revised numbers. Renaming the dish offers the same refine.
 */
export function CorrectionCard({
  renamed,
  title,
  busy,
  onRefine,
}: {
  renamed: boolean
  title: string
  busy: boolean
  onRefine: (correction?: string) => Promise<void>
}) {
  const [text, setText] = useState("")
  const trimmed = text.trim()
  return (
    <section aria-label="Fix the estimate" className="flex flex-col gap-2 rounded-card bg-white p-3.5">
      {renamed ? (
        <Chip selected={false} onClick={() => void onRefine()} disabled={busy}>
          Re-estimate as “{title.trim()}”
        </Chip>
      ) : null}
      <form
        className="flex flex-col gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          if (trimmed.length < 2 || busy) return
          await onRefine(trimmed)
          setText("")
        }}
      >
        <label htmlFor="estimate-correction" className="text-[13px] font-semibold text-muted">
          Fix something? <span className="font-normal">(optional)</span>
        </label>
        <div className="flex items-start gap-2">
          <textarea
            id="estimate-correction"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            maxLength={300}
            placeholder="Cooked in oil only, no butter"
            className="min-w-0 flex-1 rounded-tile border border-line bg-white px-3 py-2.5 text-[15px]"
          />
          <Button type="submit" size="md" variant="outline" disabled={trimmed.length < 2 || busy} className="flex-none">
            Update
          </Button>
        </div>
      </form>
    </section>
  )
}
