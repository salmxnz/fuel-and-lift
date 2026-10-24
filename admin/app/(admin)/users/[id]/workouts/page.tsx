import { Suspense } from "react"
import { WorkoutsTab } from "@/components/tabs/workouts"

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Suspense>
      <WorkoutsTab id={id} />
    </Suspense>
  )
}
