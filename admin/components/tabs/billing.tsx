"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Crown, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import {
  feedbackLabel,
  formatMoney,
  ModeBadge,
  periodLabel,
  planLabel,
  reasonLabel,
  StripeLink,
  SubscriptionBadge,
  subscriptionState,
} from "@/components/billing/shared"
import { Details } from "@/components/logs/shared"
import { Empty, Failed, LoadingCards } from "@/components/states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, errorMessage, seg } from "@/lib/api/client"
import { keys, useUserTab } from "@/lib/api/hooks"
import type { AdminPayment, AdminSubscription, AdminUserBillingResponse, StripeInfo } from "@/lib/api/types"
import { formatDate, formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"

const SOURCE: Record<string, string> = { admin: "Given by an admin", referrals: "Earned with 8 referrals", subscription: "Paid subscription" }

/** A user's plan, every subscription they've had and their payments. */
export function BillingTab({ userId }: { userId: string }) {
  const { data, error, isPending } = useUserTab<AdminUserBillingResponse>(userId, "billing")
  const qc = useQueryClient()
  const sync = useMutation({
    mutationFn: () => api.post<AdminUserBillingResponse>(`admin/users/${seg(userId)}/billing/sync`),
    onSuccess: () => {
      toast.success("Up to date with Stripe")
      qc.invalidateQueries({ queryKey: keys.user(userId) })
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
  if (error) return <Failed error={error} />
  if (isPending) return <LoadingCards />
  const { billing: b, stripe } = data

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Plan</CardTitle>
          <div className="flex items-center gap-2">
            <ModeBadge stripe={stripe} />
            {stripe.configured && data.subscriptions.length > 0 ? (
              <Button variant="outline" size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
                <RefreshCw className={cn(sync.isPending && "animate-spin")} />
                Refresh from Stripe
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <Details
            rows={[
              [
                "Plan",
                b.plan === "pro" ? (
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <Crown className="size-4 text-amber-600" />
                    Pro{b.pro_source ? ` · ${SOURCE[b.pro_source] ?? b.pro_source}` : ""}
                  </span>
                ) : (
                  "Free"
                ),
              ],
              ["Pro until", b.plan === "pro" ? (b.pro_until ? formatDate(b.pro_until) : "Forever") : null],
              [
                "Stripe customer",
                data.customer_id ? (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <code className="text-xs">{data.customer_id}</code>
                    <StripeLink stripe={stripe} path={`customers/${data.customer_id}`}>
                      Open
                    </StripeLink>
                  </span>
                ) : (
                  "None: they've never started a checkout"
                ),
              ],
            ]}
          />
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Subscriptions</h2>
        {data.subscriptions.length === 0 ? (
          <Empty title="No subscriptions">They haven&apos;t paid for Pro.</Empty>
        ) : (
          data.subscriptions.map((s) => <SubscriptionCard key={s.id} sub={s} stripe={stripe} />)
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Payments</h2>
        {data.payments_error ? (
          <div role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {data.payments_error}
          </div>
        ) : !data.payments || data.payments.length === 0 ? (
          <Empty title="No payments">{data.customer_id ? "Nothing has been charged yet." : "They've never paid."}</Empty>
        ) : (
          <Payments payments={data.payments} stripe={stripe} />
        )}
      </section>
    </div>
  )
}

function SubscriptionCard({ sub: s, stripe }: { sub: AdminSubscription; stripe: StripeInfo }) {
  const st = subscriptionState(s)
  const ended = s.status === "canceled" || s.status === "incomplete_expired"
  return (
    <Card className={cn(ended && "opacity-80")}>
      <CardHeader className="flex flex-row flex-wrap items-center gap-2">
        <CardTitle className="mr-auto">{planLabel(s)}</CardTitle>
        <SubscriptionBadge sub={s} />
        {!s.livemode ? <Badge variant="outline">Test</Badge> : null}
        <StripeLink stripe={stripe} path={`subscriptions/${s.id}`}>
          Open in Stripe
        </StripeLink>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {s.cancel_at_period_end && !ended ? (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Cancelled{s.canceled_at ? ` on ${formatDate(s.canceled_at)}` : ""}. They keep Pro until{" "}
            {formatDate(s.cancel_at ?? s.current_period_end)}, then it won&apos;t renew.
          </div>
        ) : null}
        {s.status === "past_due" || s.status === "unpaid" ? (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {s.status === "past_due"
              ? "A renewal payment failed. Stripe is retrying; Pro runs out at the end of the paid period unless one succeeds."
              : "Payments failed after every retry. Pro has ended until the invoice is paid."}
          </div>
        ) : null}
        <Details
          rows={[
            ["Status", `${st.label} (${s.status})`],
            ["Period", periodLabel(s)],
            ["Started", formatDate(s.started_at ?? s.created_at)],
            ["Cancellation asked", s.canceled_at && (s.cancel_at_period_end || ended) ? formatDateTime(s.canceled_at) : null],
            ["Ends", s.cancel_at && !ended ? formatDate(s.cancel_at) : null],
            ["Ended", s.ended_at ? formatDate(s.ended_at) : null],
            ["Reason", reasonLabel(s.cancel_reason)],
            ["Their feedback", feedbackLabel(s.cancel_feedback)],
            ["Comment", s.cancel_comment ? <q className="italic">{s.cancel_comment}</q> : null],
            ["Subscription", <code key="id" className="text-xs">{s.id}</code>],
            ["Price", s.price_id ? <code key="price" className="text-xs">{s.price_id}</code> : null],
            ["Last update", formatDateTime(s.updated_at)],
          ]}
        />
      </CardContent>
    </Card>
  )
}

function paymentState(p: AdminPayment): { label: string; className: string } {
  if (p.disputed) return { label: "Disputed", className: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200" }
  if (p.status === "failed") return { label: "Failed", className: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200" }
  if (p.refunded) return { label: "Refunded", className: "text-muted-foreground" }
  if (p.amount_refunded > 0) return { label: "Partly refunded", className: "text-muted-foreground" }
  if (p.status === "pending") return { label: "Pending", className: "text-muted-foreground" }
  return {
    label: "Paid",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  }
}

function Payments({ payments, stripe }: { payments: AdminPayment[]; stripe: StripeInfo }) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="pl-4">Date</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden md:table-cell">Details</TableHead>
            <TableHead className="pr-4 text-right">Links</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((p) => {
            const st = paymentState(p)
            return (
              <TableRow key={p.id}>
                <TableCell className="whitespace-nowrap pl-4 text-muted-foreground">{formatDateTime(p.created)}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  <span className={cn(p.refunded && "line-through text-muted-foreground")}>{formatMoney(p.amount, p.currency)}</span>
                  {p.amount_refunded > 0 && !p.refunded ? (
                    <span className="ml-1 text-xs text-muted-foreground">({formatMoney(p.amount_refunded, p.currency)} back)</span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={st.className}>
                    {st.label}
                  </Badge>
                </TableCell>
                <TableCell className="hidden max-w-72 truncate text-muted-foreground md:table-cell">
                  {p.failure_message ?? p.description ?? ""}
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <span className="inline-flex items-center gap-3">
                    {p.receipt_url ? (
                      <a href={p.receipt_url} target="_blank" rel="noreferrer" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
                        Receipt
                      </a>
                    ) : null}
                    <StripeLink stripe={stripe} path={p.payment_intent ? `payments/${p.payment_intent}` : `payments/${p.id}`} />
                  </span>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
