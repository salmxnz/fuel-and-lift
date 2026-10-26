import type { Metadata } from "next"
import { FeedbackScreen } from "@/components/me/feedback-screen"

export const metadata: Metadata = { title: "Feedback" }

export default function Page() {
  return <FeedbackScreen />
}
