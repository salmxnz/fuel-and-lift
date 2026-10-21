import type { Metadata } from "next"
import { Suspense } from "react"
import { LoadingBlock } from "@/components/ui/primitives"
import { EstimateScreen } from "@/components/food/estimate-screen"

export const metadata: Metadata = { title: "Describe it" }

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock className="app-column" />}>
      <EstimateScreen mode="text" />
    </Suspense>
  )
}
