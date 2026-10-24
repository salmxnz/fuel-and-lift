import { Suspense } from "react"
import { SessionsTab } from "@/components/tabs/sessions"

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Suspense>
      <SessionsTab id={id} />
    </Suspense>
  )
}
