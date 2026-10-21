import type { Metadata } from "next"
import { Suspense } from "react"
import { LoadingBlock } from "@/components/ui/primitives"
import { TodayScreen } from "@/components/today/today-screen"

export const metadata: Metadata = { title: "Today" }

export default function TodayPage() {
  return (
    <Suspense fallback={<LoadingBlock label="Loading today" className="pt-24" />}>
      <TodayScreen />
    </Suspense>
  )
}
