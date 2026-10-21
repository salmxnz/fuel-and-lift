import type { Metadata } from "next"
import { SharingScreen } from "@/components/me/sharing-screen"

export const metadata: Metadata = { title: "Sharing" }

export default function Page() {
  return <SharingScreen />
}
