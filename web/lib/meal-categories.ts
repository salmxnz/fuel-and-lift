// Meal categories, as in docs/api.md (MealCategory), with how the app shows them.
import type { MealCategory } from "@/lib/api/types"

export const MEAL_CATEGORIES: { key: MealCategory; label: string; emoji: string }[] = [
  { key: "home", label: "Home-cooked", emoji: "🏠" },
  { key: "takeaway", label: "Takeaway", emoji: "🥡" },
  { key: "eating_out", label: "Eating out", emoji: "🍽️" },
  { key: "snack", label: "Snack", emoji: "🍿" },
  { key: "sweet", label: "Sweet treat", emoji: "🍩" },
  { key: "drink", label: "Drink", emoji: "🥤" },
  { key: "protein", label: "High protein", emoji: "💪" },
]

const BY_KEY = new Map(MEAL_CATEGORIES.map((c) => [c.key, c]))

export function categoryLabel(c: MealCategory | null | undefined): string | null {
  return c ? (BY_KEY.get(c)?.label ?? null) : null
}

export function categoryEmoji(c: MealCategory | null | undefined): string | null {
  return c ? (BY_KEY.get(c)?.emoji ?? null) : null
}
