import type { Metadata } from "next"
import { Suspense } from "react"
import { LoadingBlock } from "@/components/ui/primitives"
import { ManualScreen } from "@/components/food/manual-screen"

export const metadata: Metadata = { title: "Enter manually" }

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock className="app-column" />}>
      <ManualScreen />
    </Suspense>
  )
}
