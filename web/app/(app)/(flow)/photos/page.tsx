import type { Metadata } from "next"
import { PhotosScreen } from "@/components/me/photos-screen"

export const metadata: Metadata = { title: "Meal photos" }

export default function Page() {
  return <PhotosScreen />
}
