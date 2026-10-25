import { Suspense } from "react"
import { NotificationsLog } from "@/components/logs/notifications-log"

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Suspense>
      <NotificationsLog userId={id} />
    </Suspense>
  )
}
