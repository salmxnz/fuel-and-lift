"use client"

import { useId, useState } from "react"
import { toast } from "sonner"
import { Sheet } from "@/components/ui/sheet"
import { Button, Chip } from "@/components/ui/primitives"
import { api, errorMessage, seg } from "@/lib/api/client"
import type { ReportReason, ShopKind } from "@/lib/api/types"

const REASONS: { id: ReportReason; label: string }[] = [
  { id: "spam", label: "Spam or ads" },
  { id: "offensive", label: "Offensive" },
  { id: "unsafe", label: "Unsafe advice" },
  { id: "other", label: "Something else" },
]

export function ReportSheet({
  kind,
  id,
  name,
  open,
  onClose,
}: {
  kind: ShopKind
  id: string
  name: string
  open: boolean
  onClose: () => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Report" description={`Tell us what's wrong with ${name}. A moderator will take a look; they won't know it was you.`}>
      {open ? <ReportForm kind={kind} id={id} onDone={onClose} /> : null}
    </Sheet>
  )
}

function ReportForm({ kind, id, onDone }: { kind: ShopKind; id: string; onDone: () => void }) {
  const noteId = useId()
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    if (!reason) return
    setBusy(true)
    setError(null)
    try {
      await api.post(`shop/${seg(kind)}/${seg(id)}/report`, { reason, note: note.trim() || null })
      toast.success("Thanks. We'll look into it.")
      onDone()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Reason" className="flex flex-wrap gap-1.5">
        {REASONS.map((r) => (
          <Chip key={r.id} selected={reason === r.id} onClick={() => setReason(r.id)}>
            {r.label}
          </Chip>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={noteId} className="text-[13px] font-semibold text-muted">
          Anything else? <span className="font-normal">(optional)</span>
        </label>
        <textarea
          id={noteId}
          value={note}
          maxLength={300}
          rows={3}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-tile border border-line bg-white px-3.5 py-3 text-[15px]"
        />
      </div>
      {error ? (
        <p role="alert" className="m-0 text-[14px] font-semibold text-danger">
          {error}
        </p>
      ) : null}
      <Button onClick={send} loading={busy} disabled={!reason}>
        Send report
      </Button>
    </div>
  )
}
