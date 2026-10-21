"use client"

import { useRouter } from "next/navigation"
import { PageHeader } from "@/components/ui/primitives"
import { WeighInForm } from "./weigh-in-sheet"

/** /weigh-in: the weigh-in form as a page (push notification target). */
export function WeighInPage() {
  const router = useRouter()
  return (
    <main className="app-column pb-safe flex min-h-dvh flex-col gap-4">
      <PageHeader back="history" title="Weigh-in" />
      <p className="m-0 -mt-1 text-[15px] leading-[1.45] text-muted">Same time of day works best, e.g. after waking up.</p>
      <WeighInForm onDone={() => router.push("/progress")} />
    </main>
  )
}
