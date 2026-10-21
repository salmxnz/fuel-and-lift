import type { Metadata } from "next"
import { MeScreen } from "@/components/me/me-screen"

export const metadata: Metadata = { title: "Me" }

export default function Page() {
  return <MeScreen />
}
