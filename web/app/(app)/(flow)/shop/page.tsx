import type { Metadata } from "next"
import { Suspense } from "react"
import { LoadingBlock } from "@/components/ui/primitives"
import { ShopScreen } from "@/components/shop/shop-screen"

export const metadata: Metadata = { title: "Shop" }

export default function ShopPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <ShopScreen />
    </Suspense>
  )
}
