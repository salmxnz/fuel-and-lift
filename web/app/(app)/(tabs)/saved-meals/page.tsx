import type { Metadata } from "next"
import { Suspense } from "react"
import { LoadingBlock } from "@/components/ui/primitives"
import { SavedMealsScreen } from "@/components/settings/saved-meals-screen"

export const metadata: Metadata = { title: "Saved meals" }

export default function SavedMealsPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <SavedMealsScreen />
    </Suspense>
  )
}
