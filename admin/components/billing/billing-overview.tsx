"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cancelWhy, formatMoney, ModeBadge, periodLabel, planLabel, StripeLink, SubscriptionBadge } from "@/components/billing/shared"
import { SearchInput, useFilterState } from "@/components/logs/shared"
import { Segmented } from "@/components/segmented"
import { Failed } from "@/components/states"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { UserAvatar } from "@/components/user-avatar"
import { api } from "@/lib/api/client"
import type { AdminBillingResponse, BillingStatusFilter, BillingSummary } from "@/lib/api/types"
import { formatDate } from "@/lib/format"

const PAGE = 50
const KEYS = ["status", "q", "page"] as const

/** Every subscription, with counts and recurring revenue on top. */
export function BillingOverview() {
  const router = useRouter()
  const [f, setF] = useFilterState(KEYS, true)
  const status = f.status as BillingStatusFilter
  const page = Math.max(0, Number(f.page) || 0)
  const query = { status, q: f.q, limit: PAGE, offset: page * PAGE }
  const { data, error, isPending, isFetching } = useQuery({
    queryKey: ["billing", query],
    queryFn: ({ signal }) => api.get<AdminBillingResponse>("admin/billing", query, signal),
    placeholderData: keepPreviousData,
  })
  const s = data?.summary
  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
          <p className="text-sm text-muted-foreground">Pro subscriptions from Stripe, kept up to date by its webhooks.</p>
        </div>
        {data ? (
          <div className="flex items-center gap-3">
            <ModeBadge stripe={data.stripe} />
            <StripeLink stripe={data.stripe} path="subscriptions">
              Open Stripe
            </StripeLink>
          </div>
        ) : null}
      </div>

      {error ? <Failed error={error} /> : null}
      <Summary summary={s} />

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Status"
            value={status || "all"}
            options={[
              { value: "all", label: "All" },
              { value: "active", label: `Active${s ? ` · ${s.active}` : ""}` },
              { value: "cancelling", label: `Cancelling${s ? ` · ${s.cancelling}` : ""}` },
              { value: "past_due", label: `Past due${s ? ` · ${s.past_due}` : ""}` },
              { value: "ended", label: "Ended" },
            ]}
            onChange={(v) => setF({ status: v === "all" ? "" : v, page: "" })}
          />
          <SearchInput value={f.q} onChange={(v) => setF({ q: v, page: "" })} placeholder="Search by name or email" />
        </div>

        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">User</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Period</TableHead>
                <TableHead className="hidden lg:table-cell">Started</TableHead>
                <TableHead className="hidden lg:table-cell">Cancel reason</TableHead>
                <TableHead className="pr-4 text-right">Stripe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={isFetching && !isPending ? "opacity-60 transition-opacity" : undefined}>
              {isPending
                ? Array.from({ length: 6 }, (_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={7} className="px-4">
                        <Skeleton className="h-9 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                : null}
              {data?.subscriptions.map((sub) => (
                <TableRow
                  key={sub.id}
                  className="cursor-pointer"
                  onClick={() => sub.user && router.push(`/users/${sub.user.id}/billing`)}
                >
                  <TableCell className="pl-4">
                    {sub.user ? (
                      <div className="flex items-center gap-3">
                        <UserAvatar name={sub.user.name || sub.user.email} src={sub.user.avatar_url} />
                        <div className="min-w-0">
                          <Link
                            href={`/users/${sub.user.id}/billing`}
                            onClick={(e) => e.stopPropagation()}
                            className="block truncate font-medium hover:underline"
                          >
                            {sub.user.name || sub.user.email}
                          </Link>
                          <div className="truncate text-xs text-muted-foreground">{sub.user.email}</div>
                        </div>
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{planLabel(sub)}</TableCell>
                  <TableCell>
                    <SubscriptionBadge sub={sub} />
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">{periodLabel(sub)}</TableCell>
                  <TableCell className="hidden whitespace-nowrap text-muted-foreground lg:table-cell">
                    {formatDate(sub.started_at ?? sub.created_at)}
                  </TableCell>
                  <TableCell className="hidden max-w-56 truncate text-muted-foreground lg:table-cell">
                    {sub.cancel_at_period_end || sub.status === "canceled" ? (cancelWhy(sub) ?? "No reason given") : ""}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    {data ? <StripeLink stripe={data.stripe} path={`subscriptions/${sub.id}`} /> : null}
                  </TableCell>
                </TableRow>
              ))}
              {data && data.subscriptions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                    {status || f.q ? "No subscriptions match." : "No one has subscribed yet."}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span className="tabular-nums">
            {total === 0 ? "0 subscriptions" : `${page * PAGE + 1}–${Math.min(total, (page + 1) * PAGE)} of ${total}`}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setF({ page: page - 1 > 0 ? String(page - 1) : "" })}>
              <ChevronLeft />
              Previous
            </Button>
            <span className="tabular-nums">
              {page + 1} / {pages}
            </span>
            <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setF({ page: String(page + 1) })}>
              Next
              <ChevronRight />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Summary({ summary: s }: { summary: BillingSummary | undefined }) {
  if (!s) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    )
  }
  const mrr = s.mrr.length ? s.mrr.map((m) => formatMoney(m.amount, m.currency)).join(" + ") : formatMoney(0, "usd")
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      <Stat label="Monthly recurring revenue" value={mrr} note={`${s.monthly} monthly · ${s.yearly} yearly`} />
      <Stat label="Active" value={s.active} note="Paying and renewing" />
      <Stat label="Cancelling" value={s.cancelling} note="Paid up, won't renew" />
      <Stat label="Past due" value={s.past_due} note="A payment failed" alert={s.past_due > 0} />
      <Stat label="Last 30 days" value={`+${s.new_30d} / −${s.ended_30d}`} note="Started / ended" />
    </div>
  )
}

function Stat({ label, value, note, alert }: { label: string; value: React.ReactNode; note: string; alert?: boolean }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="flex flex-col gap-1 px-4">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={alert ? "text-2xl font-semibold tabular-nums text-destructive" : "text-2xl font-semibold tabular-nums"}>{value}</span>
        <span className="text-xs text-muted-foreground">{note}</span>
      </CardContent>
    </Card>
  )
}
