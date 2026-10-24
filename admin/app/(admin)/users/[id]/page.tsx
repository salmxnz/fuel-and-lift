import { Suspense } from "react"
import { OverviewTab } from "@/components/tabs/overview"

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Suspense>
      <OverviewTab id={id} />
    </Suspense>
  )
}
