import { Suspense } from "react"
import { MealsTab } from "@/components/tabs/meals"

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Suspense>
      <MealsTab id={id} />
    </Suspense>
  )
}
