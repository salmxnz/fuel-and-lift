import type { Metadata } from "next"
import { Suspense } from "react"
import { LoadingBlock } from "@/components/ui/primitives"
import { RestaurantScreen } from "@/components/food/restaurant-screen"

export const metadata: Metadata = { title: "Restaurant" }

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock className="app-column" />}>
      <RestaurantScreen />
    </Suspense>
  )
}
