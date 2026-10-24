import { Suspense } from "react"
import { RoutinesTab } from "@/components/tabs/routines"

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Suspense>
      <RoutinesTab id={id} />
    </Suspense>
  )
}
