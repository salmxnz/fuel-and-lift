"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button, CloseButton, ErrorCard, ReferralBar, Skeleton } from "@/components/ui/primitives"
import { ChevronRightIcon } from "@/components/ui/icons"
import { ApiError, api, errorMessage } from "@/lib/api/client"
import type { BillingResponse, CheckoutResponse } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { formatDayMonth, parseISODate } from "@/lib/dates"

const SOURCE: Record<string, string> = {
  admin: "Given by an admin",
  referrals: "Earned by inviting friends",
  subscription: "Subscription",
}

/** Paywall.dc.html. */
export function ProScreen() {
  const router = useRouter()
  const params = useSearchParams()
  const hitLimit = params.get("reason") === "photo_limit"
  const billing = useApi<BillingResponse>("billing")
  const [checkingOut, setCheckingOut] = useState(false)

  useEffect(() => {
    document.body.classList.add("theme-night")
    return () => document.body.classList.remove("theme-night")
  }, [])

  const b = billing.data?.billing
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
      const res = await api.post<CheckoutResponse>("billing/checkout")
      if (res?.url && /^https:\/\//.test(res.url)) window.location.assign(res.url)
      else toast("Payments are coming soon")
    } catch (err) {
      if (err instanceof ApiError && err.status === 501) toast("Payments are coming soon")
      else toast.error(errorMessage(err))
    } finally {
      setCheckingOut(false)
    }
  }

  const close = () => (window.history.length > 1 ? router.back() : router.push("/me"))

  return (
    <main
      className="on-dark app-column flex min-h-dvh flex-col gap-[18px] bg-night text-white"
      style={{ paddingBottom: "calc(var(--safe-bottom) + 28px)" }}
    >
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-lime px-2.5 py-[5px] text-[13px] font-extrabold text-ink">PRO</span>
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
              {b.pro_until ? `Until ${formatDayMonth(b.pro_until.slice(0, 10))}.` : "No end date."}
            </p>
          </div>
          <div className="flex-1" />
          <Link
            href="/today"
            className="flex min-h-[58px] items-center justify-center rounded-btn bg-lime text-[17px] font-extrabold text-ink no-underline"
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
                <th scope="col" className="w-[84px] pb-2 text-right text-[12px] font-extrabold text-lime">
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
            <Button variant="lime" onClick={checkout} loading={checkingOut} className="min-h-[58px] text-[17px] font-extrabold">
              Get Pro
            </Button>
            <span className="text-center text-[12px] text-night-muted">Cancel any time.</span>
          </div>

          <div className="flex items-center gap-3 text-[12px] text-night-dim">
            <span className="h-px flex-1 bg-night-2" />
            or
            <span className="h-px flex-1 bg-night-2" />
          </div>

          <Link href="/friends/add" className="flex flex-col gap-2.5 rounded-card border-[1.5px] border-night-3 p-3.5 text-white no-underline">
            <span className="flex items-baseline justify-between gap-3">
              <span className="text-[15px] font-bold">Invite {b.referrals.needed} friends, get Pro forever</span>
              <span className="flex-none text-[13px] font-bold text-lime">
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
