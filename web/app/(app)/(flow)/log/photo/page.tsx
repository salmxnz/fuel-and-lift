import type { Metadata } from "next"
import { Suspense } from "react"
import { LoadingBlock } from "@/components/ui/primitives"
import { EstimateScreen } from "@/components/food/estimate-screen"

export const metadata: Metadata = { title: "Take a photo" }

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock className="app-column" />}>
      <EstimateScreen mode="photo" />
    </Suspense>
  )
}
