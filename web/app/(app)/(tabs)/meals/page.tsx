import type { Metadata } from "next"
import { MealSlotsScreen } from "@/components/settings/meal-slots-screen"

export const metadata: Metadata = { title: "My meals" }

export default function MealsPage() {
  return <MealSlotsScreen />
}
