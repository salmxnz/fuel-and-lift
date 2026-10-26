import { ExternalLink } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { AdminSubscription, StripeInfo, Subscription } from "@/lib/api/types"
import { formatShortDate } from "@/lib/format"
import { cn } from "@/lib/utils"

// Shared by the billing page and a user's billing tab.

/** 249 "usd" → "$2.49". */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amount / 100)
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`
  }
}

/** "Yearly · $24.90", or "—" before the plan is known. */
export function planLabel(s: Pick<Subscription, "interval" | "amount" | "currency">): string {
  const name = s.interval === "year" ? "Yearly" : s.interval === "month" ? "Monthly" : null
  const price = s.amount != null && s.currency ? formatMoney(s.amount, s.currency) : null
  return [name, price].filter(Boolean).join(" · ") || "—"
}

const tone = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  warn: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
  bad: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
  info: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200",
  muted: "text-muted-foreground",
}

/** Where a subscription stands, in words an admin can act on. */
export function subscriptionState(s: Subscription): { label: string; tone: keyof typeof tone } {
  switch (s.status) {
    case "active":
      return s.cancel_at_period_end ? { label: "Cancelling", tone: "warn" } : { label: "Active", tone: "good" }
    case "trialing":
      return s.cancel_at_period_end ? { label: "Trial, cancelling", tone: "warn" } : { label: "Trial", tone: "info" }
    case "past_due":
      return { label: "Past due", tone: "bad" }
    case "unpaid":
      return { label: "Unpaid", tone: "bad" }
    case "paused":
      return { label: "Paused", tone: "muted" }
    case "incomplete":
      return { label: "Incomplete", tone: "muted" }
    case "incomplete_expired":
      return { label: "Never paid", tone: "muted" }
    case "canceled":
      return { label: "Ended", tone: "muted" }
  }
}

export function SubscriptionBadge({ sub }: { sub: Subscription }) {
  const st = subscriptionState(sub)
  return (
    <Badge variant="outline" className={cn(tone[st.tone])}>
      {st.label}
    </Badge>
  )
}

/** "Renews 26 Nov", "Ends 26 Oct 2027", "Ended 3 Nov". */
export function periodLabel(s: Subscription): string {
  if (s.status === "canceled" || s.status === "incomplete_expired") return s.ended_at ? `Ended ${formatShortDate(s.ended_at)}` : "Ended"
  if (s.cancel_at_period_end) return `Ends ${formatShortDate(s.current_period_end)}`
  if (s.status === "past_due" || s.status === "unpaid") return `Paid until ${formatShortDate(s.current_period_end)}`
  return `Renews ${formatShortDate(s.current_period_end)}`
}

const FEEDBACK: Record<string, string> = {
  too_expensive: "Too expensive",
  missing_features: "Missing features",
  switched_service: "Switched to another service",
  unused: "Doesn't use it enough",
  customer_service: "Customer service",
  too_complex: "Too complex",
  low_quality: "Quality wasn't good enough",
  other: "Other",
}

const REASON: Record<string, string> = {
  cancellation_requested: "Cancellation requested",
  payment_failed: "Payments failed",
  payment_disputed: "Payment disputed or refunded",
}

/**
 * Why a subscription was cancelled: the customer's answer, else the comment
 * (ours say why we cancelled it), else Stripe's reason.
 */
export function cancelWhy(s: Pick<AdminSubscription, "cancel_feedback" | "cancel_comment" | "cancel_reason">): string | null {
  if (s.cancel_feedback) return FEEDBACK[s.cancel_feedback] ?? s.cancel_feedback
  if (s.cancel_comment) return s.cancel_comment
  if (s.cancel_reason) return REASON[s.cancel_reason] ?? s.cancel_reason
  return null
}

export function reasonLabel(reason: string | null): string | null {
  return reason ? (REASON[reason] ?? reason) : null
}

export function feedbackLabel(feedback: string | null): string | null {
  return feedback ? (FEEDBACK[feedback] ?? feedback) : null
}

/** A link into the Stripe Dashboard (subscriptions/sub_…), or nothing when Stripe is off. */
export function StripeLink({ stripe, path, children, className }: { stripe: StripeInfo; path: string; children?: React.ReactNode; className?: string }) {
  if (!stripe.configured) return null
  return (
    <a
      href={`${stripe.dashboard_url}/${path}`}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn("inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline", className)}
    >
      {children ?? "Stripe"}
      <ExternalLink className="size-3.5" />
    </a>
  )
}

export function ModeBadge({ stripe }: { stripe: StripeInfo }) {
  if (!stripe.configured) return <Badge variant="outline">Stripe not configured</Badge>
  return stripe.mode === "test" ? (
    <Badge variant="outline" className={cn(tone.warn)}>
      Test mode
    </Badge>
  ) : (
    <Badge variant="outline" className={cn(tone.good)}>
      Live
    </Badge>
  )
}
