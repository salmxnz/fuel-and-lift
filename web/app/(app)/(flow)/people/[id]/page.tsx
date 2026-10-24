import type { Metadata } from "next"
import { PersonScreen } from "@/components/people/person-screen"

export const metadata: Metadata = { title: "Profile" }

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <PersonScreen id={id} />
}
