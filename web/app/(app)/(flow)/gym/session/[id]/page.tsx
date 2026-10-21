import type { Metadata } from "next"
import { SessionScreen } from "@/components/gym/session-screen"

export const metadata: Metadata = { title: "Workout" }

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <SessionScreen id={id} />
}
