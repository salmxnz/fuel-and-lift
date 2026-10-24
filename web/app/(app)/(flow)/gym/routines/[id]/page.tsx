import type { Metadata } from "next"
import { RoutineEditor } from "@/components/gym/routine-editor"

export const metadata: Metadata = { title: "Routine" }

export default async function RoutinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <RoutineEditor id={id} />
}
