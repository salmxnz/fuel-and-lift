"use client"

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { PersonCell, useFilterState } from "@/components/logs/shared"
import { Segmented } from "@/components/segmented"
import { Empty, Failed, LoadingCards } from "@/components/states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { api, errorMessage, seg } from "@/lib/api/client"
import { useLogPages } from "@/lib/api/hooks"
import type { Feedback, FeedbackKind, FeedbackListResponse, FeedbackResponse, FeedbackStatus } from "@/lib/api/types"
import { formatDateTime, formatRelative } from "@/lib/format"
import { cn } from "@/lib/utils"

const KIND: Record<FeedbackKind, { label: string; className: string }> = {
  bug: { label: "Bug", className: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200" },
  idea: { label: "Idea", className: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200" },
  other: { label: "Other", className: "text-muted-foreground" },
}

const STATUS_LABEL: Record<FeedbackStatus, string> = { new: "New", seen: "Seen", done: "Done" }

const KEYS = ["status", "kind"] as const

/** Everyone's feedback, filtered in the URL, newest first, with "load more". */
export function FeedbackList() {
  const [f, setF] = useFilterState(KEYS, true)
  const filters: Record<string, string> = { status: f.status, kind: f.kind }
  const { data, error, isPending, fetchNextPage, hasNextPage, isFetchingNextPage } = useLogPages<FeedbackListResponse>(
    "admin/feedback",
    filters,
    false
  )
  const rows = data?.pages.flatMap((p) => p.feedback) ?? []
  const counts = data?.pages[0]?.counts
  const [photo, setPhoto] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Status"
          value={f.status || "all"}
          options={[
            { value: "all", label: "All" },
            { value: "new", label: `New${counts ? ` · ${counts.new}` : ""}` },
            { value: "seen", label: `Seen${counts ? ` · ${counts.seen}` : ""}` },
            { value: "done", label: `Done${counts ? ` · ${counts.done}` : ""}` },
          ]}
          onChange={(v) => setF({ status: v === "all" ? "" : v })}
        />
        <Segmented
          label="Kind"
          value={f.kind || "all"}
          options={[
            { value: "all", label: "Any kind" },
            { value: "bug", label: "Bugs" },
            { value: "idea", label: "Ideas" },
            { value: "other", label: "Other" },
          ]}
          onChange={(v) => setF({ kind: v === "all" ? "" : v })}
        />
      </div>

      {error ? (
        <Failed error={error} />
      ) : isPending ? (
        <LoadingCards />
      ) : rows.length === 0 ? (
        <Empty title="No feedback here">{f.status || f.kind ? "Try another filter." : "When people send feedback from the app, it shows up here."}</Empty>
      ) : (
        <div className="grid gap-3">
          {rows.map((x) => (
            <FeedbackCard key={x.id} f={x} onPhoto={setPhoto} />
          ))}
        </div>
      )}

      {hasNextPage ? (
        <Button variant="outline" className="self-center" onClick={() => void fetchNextPage()} disabled={isFetchingNextPage}>
          {isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      ) : null}

      <Dialog open={photo != null} onOpenChange={(o) => !o && setPhoto(null)}>
        <DialogContent className="max-w-3xl">
          <DialogTitle className="sr-only">Screenshot</DialogTitle>
          {/* eslint-disable-next-line @next/next/no-img-element -- signed R2 link */}
          {photo ? <img src={photo} alt="Screenshot" className="max-h-[80vh] w-full rounded-lg object-contain" /> : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FeedbackCard({ f, onPhoto }: { f: Feedback; onPhoto: (url: string) => void }) {
  const qc = useQueryClient()
  const [note, setNote] = useState(f.admin_note ?? "")
  const save = useMutation({
    mutationFn: (body: { status?: FeedbackStatus; admin_note?: string }) => api.patch<FeedbackResponse>(`admin/feedback/${seg(String(f.id))}`, body),
    onSuccess: (_res, body) => {
      toast.success(body.admin_note !== undefined ? "Reply saved. They'll see it in the app." : `Marked ${STATUS_LABEL[body.status!].toLowerCase()}`)
      qc.invalidateQueries({ queryKey: ["logs", "admin/feedback"] })
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
  const noteChanged = note.trim() !== (f.admin_note ?? "")

  return (
    <Card className={cn(f.status === "new" && "ring-2 ring-primary/20")}>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <PersonCell person={f.user} fallback="Deleted user" />
          <Badge variant="outline" className={KIND[f.kind].className}>
            {KIND[f.kind].label}
          </Badge>
          <span className="text-muted-foreground" title={formatDateTime(f.created_at)}>
            {formatRelative(f.created_at)}
          </span>
          {f.page ? <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{f.page}</code> : null}
          <div className="ml-auto">
            <Segmented
              label="Status"
              value={f.status}
              options={(["new", "seen", "done"] as const).map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
              onChange={(s) => s !== f.status && save.mutate({ status: s })}
            />
          </div>
        </div>

        <p className="whitespace-pre-wrap text-sm leading-relaxed">{f.message}</p>

        {f.photos.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {f.photos.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPhoto(p.url)}
                aria-label={`Open screenshot ${i + 1}`}
                className="size-24 overflow-hidden rounded-lg border bg-muted"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- signed R2 link */}
                <img src={p.url} alt="" className="size-full object-cover" />
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="Reply (shown to them in the app)"
            aria-label={`Reply to ${f.user.name || "them"}`}
            className="min-h-0 flex-1"
          />
          <Button
            variant="outline"
            disabled={!noteChanged || save.isPending}
            onClick={() => save.mutate({ admin_note: note.trim(), ...(f.status === "new" ? { status: "seen" as const } : {}) })}
          >
            Save reply
          </Button>
        </div>
        {f.user_agent ? <p className="truncate text-xs text-muted-foreground">{f.user_agent}</p> : null}
      </CardContent>
    </Card>
  )
}
