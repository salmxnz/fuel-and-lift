import type { Metadata } from "next"
import { LandingPage } from "@/components/landing/landing-page"

// Signed-out visitors only: the proxy sends signed-in users to /today.
export const metadata: Metadata = {
  title: { absolute: "adebite: calories and gym, with your friends" },
  description:
    "Snap a meal for its calories, follow a gym plan and keep a few friends in the loop. A free web app you add to your Home Screen, no App Store needed.",
  robots: { index: true, follow: true },
}

export default function Home() {
  return <LandingPage />
}
