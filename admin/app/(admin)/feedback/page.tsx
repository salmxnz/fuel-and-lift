import type { Metadata } from "next"
import { Suspense } from "react"
import { FeedbackList } from "@/components/feedback/feedback-list"

export const metadata: Metadata = { title: "Feedback" }

export default function FeedbackPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Feedback</h1>
        <p className="text-sm text-muted-foreground">What people sent from Me → Feedback, newest first. A note is shown to the sender.</p>
      </div>
      <Suspense>
        <FeedbackList />
      </Suspense>
    </div>
  )
}
