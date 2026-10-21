import type { Metadata } from "next"
import { Suspense } from "react"
import { LoadingBlock } from "@/components/ui/primitives"
import { ProScreen } from "@/components/me/pro-screen"

export const metadata: Metadata = { title: "Pro" }

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <ProScreen />
    </Suspense>
  )
}
