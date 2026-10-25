import type { Metadata } from "next"
import { Suspense } from "react"
import { NotificationsLog } from "@/components/logs/notifications-log"

export const metadata: Metadata = { title: "Notifications" }

export default function NotificationsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <p className="text-sm text-muted-foreground">Every push and email the server tried to send, newest first. Kept 90 days.</p>
      </div>
      <Suspense>
        <NotificationsLog />
      </Suspense>
    </div>
  )
}
