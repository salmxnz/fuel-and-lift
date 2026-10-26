"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button, CloseButton, ErrorCard, ReferralBar, Skeleton } from "@/components/ui/primitives"
import { ChevronRightIcon } from "@/components/ui/icons"
import { ApiError, api, errorMessage } from "@/lib/api/client"
import type { BillingResponse, CheckoutResponse, PortalResponse, ProPlan } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { formatDayMonth, parseISODate } from "@/lib/dates"

const SOURCE: Record<string, string> = {
  admin: "Given by an admin",
  referrals: "Earned by inviting friends",
  subscription: "Subscription",
}

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat("en", { style: "currency", currency: currency.toUpperCase() }).format(amount / 100)
}

/** "26 Oct", or "26 Oct 2027" when it isn't this year (yearly plans). */
function formatEnd(iso: string): string {
  const d = parseISODate(iso.slice(0, 10))
  return d.getFullYear() === new Date().getFullYear()
    ? formatDayMonth(iso.slice(0, 10))
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

/** How many months of the monthly price a year saves, e.g. 2. */
function monthsFree(monthly: ProPlan | undefined, yearly: ProPlan | undefined): number {
  if (!monthly || !yearly || monthly.amount <= 0) return 0
  return Math.floor((monthly.amount * 12 - yearly.amount) / monthly.amount)
}

/** Paywall.dc.html. */
export function ProScreen() {
  const router = useRouter()
  const params = useSearchParams()
  const hitLimit = params.get("reason") === "photo_limit"
  const paid = params.get("checkout") === "success"
  const billing = useApi<BillingResponse>("billing")
  const [checkingOut, setCheckingOut] = useState(false)
  const [openingPortal, setOpeningPortal] = useState(false)
  const [gaveUp, setGaveUp] = useState(false)
  const [picked, setPicked] = useState<ProPlan["id"] | null>(null)

  useEffect(() => {
    document.body.classList.add("theme-night")
    return () => document.body.classList.remove("theme-night")
  }, [])

  const b = billing.data?.billing
  const plans = billing.data?.plans ?? []
  const monthly = plans.find((p) => p.id === "monthly")
  const yearly = plans.find((p) => p.id === "yearly")
  const saved = monthsFree(monthly, yearly)
  // Yearly is picked until they choose.
  const plan = picked ?? (yearly ? "yearly" : "monthly")
  const isPro = b?.plan === "pro"
  const { reload } = billing
  const confirming = paid && !isPro && !gaveUp

  // Back from Stripe Checkout: Pro starts when Stripe's webhook reaches the
  // API, usually within seconds, so check a few times.
  useEffect(() => {
    if (!paid) return
    if (isPro) {
      toast("Welcome to Pro")
      router.replace("/pro")
      return
    }
    let tries = 0
    const timer = window.setInterval(() => {
      tries += 1
      if (tries > 10) {
        window.clearInterval(timer)
        setGaveUp(true)
        return
      }
      void reload()
    }, 2000)
    return () => window.clearInterval(timer)
  }, [paid, isPro, reload, router])

  const limit = b?.photo_estimates.limit_this_month
  const used = b?.photo_estimates.used_this_month ?? 0
  const resets = b?.photo_estimates.resets_on
  const resetsText = resets
    ? parseISODate(resets).toLocaleDateString("en-GB", { day: "numeric", month: "long" })
    : "next month"
  const overLimit = limit != null && used >= limit

  async function checkout() {
    setCheckingOut(true)
    try {
      const res = await api.post<CheckoutResponse>("billing/checkout", { plan })
      if (res?.url && /^https:\/\//.test(res.url)) window.location.assign(res.url)
      else toast("Payments are coming soon")
    } catch (err) {
      if (err instanceof ApiError && err.status === 501) toast("Payments are coming soon")
      else toast.error(errorMessage(err))
    } finally {
      setCheckingOut(false)
    }
  }

  async function manage() {
    setOpeningPortal(true)
    try {
      const res = await api.post<PortalResponse>("billing/portal")
      if (res?.url && /^https:\/\//.test(res.url)) window.location.assign(res.url)
      else setOpeningPortal(false)
    } catch (err) {
      toast.error(errorMessage(err))
      setOpeningPortal(false)
    }
  }

  const sub = b?.subscription ?? null
  const paying = b?.pro_source === "subscription" && sub != null
  const paymentFailed = sub != null && (sub.status === "past_due" || sub.status === "unpaid")
  const periodEnd = sub ? formatEnd(sub.current_period_end) : ""

  const close = () => (window.history.length > 1 ? router.back() : router.push("/me"))

  return (
    <main
      className="on-dark app-column flex min-h-dvh flex-col gap-[18px] bg-night text-white"
      style={{ paddingBottom: "calc(var(--safe-bottom) + 28px)" }}
    >
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-pink px-2.5 py-[5px] text-[13px] font-extrabold text-ink">PRO</span>
        <CloseButton dark onClick={close} />
      </div>

      {billing.error && !b ? (
        <ErrorCard dark message={billing.error.message} onRetry={() => void billing.reload()} />
      ) : !b ? (
        <div className="on-dark flex flex-col gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
        </div>
      ) : b.plan === "pro" ? (
        <>
          <div className="flex flex-col gap-2.5">
            <h1 className="m-0 text-[44px] font-extrabold leading-[0.98] tracking-[-0.035em]">You&apos;re on Pro.</h1>
            <p className="m-0 text-[15px] leading-[1.45] text-night-soft">
              Unlimited photo estimates. {b.pro_source ? `${SOURCE[b.pro_source]}.` : ""}{" "}
              {paying
                ? paymentFailed
                  ? `Your last payment didn't go through. Update your card to keep Pro after ${periodEnd}.`
                  : sub.cancel_at_period_end
                    ? `Cancelled, ends on ${periodEnd}.`
                    : `Renews on ${periodEnd}.`
                : b.pro_until
                  ? `Until ${formatEnd(b.pro_until)}.`
                  : "No end date."}
            </p>
          </div>
          <div className="flex-1" />
          {paying && (
            <Button variant="night-outline" onClick={manage} loading={openingPortal}>
              {paymentFailed ? "Update payment" : "Manage subscription"}
            </Button>
          )}
          <Link
            href="/today"
            className="flex min-h-[58px] items-center justify-center rounded-btn bg-pink text-[17px] font-extrabold text-ink no-underline"
          >
            Back to Today
          </Link>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-2.5">
            <h1 className="m-0 text-[44px] font-extrabold leading-[0.98] tracking-[-0.035em]">Snap every meal.</h1>
            <p className="m-0 text-[15px] leading-[1.45] text-night-soft">
              {overLimit || hitLimit
                ? `You've used all ${limit ?? 10} photo estimates this month. They come back on ${resetsText}.`
                : `${used} of ${limit ?? 10} photo estimates used this month. They reset on ${resetsText}.`}
            </p>
          </div>

          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr>
                <th scope="col" className="pb-2 text-left text-[12px] font-medium text-night-muted">
                  <span className="sr-only">Feature</span>
                </th>
                <th scope="col" className="w-[76px] pb-2 text-right text-[12px] font-semibold text-night-muted">
                  Free
                </th>
                <th scope="col" className="w-[84px] pb-2 text-right text-[12px] font-extrabold text-pink">
                  Pro
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-night-2">
                <td className="py-3">Photo estimates</td>
                <td className="py-3 text-right text-night-muted">{limit ?? 10} a month</td>
                <td className="py-3 text-right font-bold">Unlimited</td>
              </tr>
              <tr className="border-t border-night-2">
                <td className="py-3">Describe it and restaurants</td>
                <td className="py-3 text-right text-night-muted">Fair use</td>
                <td className="py-3 text-right font-bold">Unlimited</td>
              </tr>
              <tr className="border-t border-night-2">
                <td className="py-3">Food log, gym, friends</td>
                <td className="py-3 text-right text-night-muted">Included</td>
                <td className="py-3 text-right font-bold">Included</td>
              </tr>
            </tbody>
          </table>

          <div className="flex-1" />
          <div className="flex flex-col gap-2">
            {confirming ? (
              <Button variant="pink" loading className="min-h-[58px] text-[17px] font-extrabold">
                Confirming your payment
              </Button>
            ) : paymentFailed ? (
              <>
                <Button variant="pink" onClick={manage} loading={openingPortal} className="min-h-[58px] text-[17px] font-extrabold">
                  Update payment
                </Button>
                <span className="text-center text-[12px] text-night-muted">Your last payment didn&apos;t go through.</span>
              </>
            ) : (
              <>
                {plans.length > 1 && (
                  <div role="radiogroup" aria-label="Plan" className="grid grid-cols-2 gap-2">
                    {plans.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        role="radio"
                        aria-checked={plan === p.id}
                        onClick={() => setPicked(p.id)}
                        className={`flex flex-col items-start gap-0.5 rounded-card border-[1.5px] p-3 text-left text-white ${
                          plan === p.id ? "border-pink" : "border-night-3"
                        }`}
                      >
                        <span className="flex w-full items-baseline justify-between gap-2 text-[13px] font-bold">
                          {p.id === "yearly" ? "Yearly" : "Monthly"}
                          {p.id === "yearly" && saved > 0 && (
                            <span className="text-[11px] font-extrabold text-pink">{saved} months free</span>
                          )}
                        </span>
                        <span className="text-[17px] font-extrabold">{money(p.amount, p.currency)}</span>
                        <span className="text-[12px] text-night-muted">
                          {p.interval === "year" ? `a year, ${money(Math.round(p.amount / 12), p.currency)}/mo` : "a month"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <Button variant="pink" onClick={checkout} loading={checkingOut} className="min-h-[58px] text-[17px] font-extrabold">
                  {plans.length === 1 ? `Get Pro, ${money(plans[0].amount, plans[0].currency)} a ${plans[0].interval}` : "Get Pro"}
                </Button>
                <span className="text-center text-[12px] text-night-muted">
                  {paid ? "Still confirming your payment. Check back in a minute." : "Cancel any time."}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 text-[12px] text-night-dim">
            <span className="h-px flex-1 bg-night-2" />
            or
            <span className="h-px flex-1 bg-night-2" />
          </div>

          <Link href="/friends/add" className="flex flex-col gap-2.5 rounded-card border-[1.5px] border-night-3 p-3.5 text-white no-underline">
            <span className="flex items-baseline justify-between gap-3">
              <span className="text-[15px] font-bold">Invite {b.referrals.needed} friends, get Pro forever</span>
              <span className="flex-none text-[13px] font-bold text-pink">
                {b.referrals.joined} of {b.referrals.needed}
              </span>
            </span>
            <ReferralBar joined={b.referrals.joined} needed={b.referrals.needed} />
            <span className="flex justify-between text-[13px] text-night-muted">
              Send a friend link
              <ChevronRightIcon size={16} />
            </span>
          </Link>
        </>
      )}
    </main>
  )
}
