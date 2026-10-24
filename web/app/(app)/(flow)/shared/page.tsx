import type { Metadata } from "next"
import { SharedScreen } from "@/components/me/shared-screen"

export const metadata: Metadata = { title: "Shared" }

export default function Page() {
  return <SharedScreen />
}
