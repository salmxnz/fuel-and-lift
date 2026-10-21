import type { Metadata } from "next"
import { WeighInPage } from "@/components/food/weigh-in-page"

export const metadata: Metadata = { title: "Weigh-in" }

export default function Page() {
  return <WeighInPage />
}
