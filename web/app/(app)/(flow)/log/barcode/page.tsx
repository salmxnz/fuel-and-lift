import type { Metadata } from "next"
import { Suspense } from "react"
import { LoadingBlock } from "@/components/ui/primitives"
import { BarcodeScreen } from "@/components/food/barcode-screen"

export const metadata: Metadata = { title: "Scan barcode" }

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock className="app-column" />}>
      <BarcodeScreen />
    </Suspense>
  )
}
