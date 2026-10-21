import type { Metadata } from "next"
import { GoalScreen } from "@/components/settings/goal-screen"

export const metadata: Metadata = { title: "Goal and targets" }

export default function Page() {
  return <GoalScreen />
}
