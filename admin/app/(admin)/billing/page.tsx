import type { Metadata } from "next"
import { Suspense } from "react"
import { BillingOverview } from "@/components/billing/billing-overview"

export const metadata: Metadata = { title: "Billing" }

export default function BillingPage() {
  return (
    <Suspense>
      <BillingOverview />
    </Suspense>
  )
}
