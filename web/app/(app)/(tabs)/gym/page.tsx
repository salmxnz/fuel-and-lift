import type { Metadata } from "next"
import { GymScreen } from "@/components/gym/gym-screen"

export const metadata: Metadata = { title: "Gym" }

export default function GymPage() {
  return <GymScreen />
}
