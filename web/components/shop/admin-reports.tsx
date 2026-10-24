"use client"

import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"
import { Avatar, Button, ErrorCard, LoadingBlock, PageHeader } from "@/components/ui/primitives"
import { useMe } from "@/components/me-context"
import { api, errorMessage, seg } from "@/lib/api/client"
import type { ReportGroup, ReportsResponse } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { formatDayMonth } from "@/lib/dates"
import { KIND_ONE } from "./shop-card"

const REASON: Record<string, string> = { spam: "spam", offensive: "offensive", unsafe: "unsafe", other: "other" }

/** Moderation: items people reported, most reported first. */
export function AdminReports() {
  const me = useMe()
  const admin = me.user.role === "admin"
  const res = useApi<ReportsResponse>(admin ? "admin/reports" : null)
  const [busy, setBusy] = useState<string | null>(null)

  if (!admin) {
    return (
      <main className="app-column pb-safe flex flex-col gap-4">
        <PageHeader back="/shop" title="Reports" />
        <p className="m-0 rounded-card bg-white p-4 text-[15px] text-muted">Only moderators can see this.</p>
      </main>
    )
  }

  const reports = res.data?.reports ?? []
  const drop = (g: ReportGroup) =>
    res.setData((prev) => ({ reports: (prev?.reports ?? []).filter((x) => !(x.kind === g.kind && x.item_id === g.item_id)) }))

  async function act(g: ReportGroup, action: "hide" | "dismiss") {
    setBusy(`${g.item_id}:${action}`)
    try {
      await api.post(`admin/shop/${seg(g.kind)}/${seg(g.item_id)}/${action}`, {})
      drop(g)
      toast.success(action === "hide" ? `${g.name} hidden from the Shop` : "Reports dismissed")
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="app-column pb-safe flex min-h-dvh flex-col gap-3.5">
      <PageHeader back="/shop" eyebrow="Moderation" title="Reports" />
      {res.error && !res.data ? (
        <ErrorCard message={res.error.message} onRetry={() => void res.reload()} />
      ) : res.loading ? (
        <LoadingBlock label="Loading reports" />
      ) : reports.length === 0 ? (
        <p className="m-0 rounded-card border-[1.5px] border-dashed border-dash p-4 text-[15px] text-muted">Nothing to review.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {reports.map((g) => (
            <li key={`${g.kind}:${g.item_id}`} className="flex flex-col gap-3 rounded-card bg-white p-3.5">
              <Link href={`/shop/${g.kind}/${g.item_id}`} className="flex flex-col gap-1 no-underline">
                <span className="text-[12px] font-semibold text-muted">
                  {KIND_ONE[g.kind]} · {g.count} report{g.count === 1 ? "" : "s"} since {formatDayMonth(g.first_reported_at.slice(0, 10))}
                  {g.hidden ? " · hidden" : ""}
                </span>
                <span className="text-[16px] font-bold">{g.name}</span>
                <span className="flex items-center gap-2 text-[13px]">
                  <Avatar name={g.creator.name} url={g.creator.avatar_url} size={22} />
                  {g.creator.name}
                </span>
              </Link>
              <span className="text-[13px] text-muted">
                {Object.entries(g.reasons)
                  .map(([r, n]) => `${n} ${REASON[r] ?? r}`)
                  .join(" · ")}
              </span>
              {g.notes.length > 0 ? (
                <ul className="m-0 flex list-none flex-col gap-1 border-l-2 border-line pl-3 text-[13px]">
                  {g.notes.map((n, i) => (
                    <li key={i}>&ldquo;{n}&rdquo;</li>
                  ))}
                </ul>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="danger" loading={busy === `${g.item_id}:hide`} disabled={busy !== null} onClick={() => void act(g, "hide")}>
                  Hide it
                </Button>
                <Button size="sm" variant="outline" loading={busy === `${g.item_id}:dismiss`} disabled={busy !== null} onClick={() => void act(g, "dismiss")}>
                  It&apos;s fine
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
