import type { Metadata } from "next"
import { ReviewScreen } from "@/components/gym/review-screen"

export const metadata: Metadata = { title: "Quick review" }

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ReviewScreen id={id} />
}
