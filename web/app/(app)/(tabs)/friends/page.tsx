import type { Metadata } from "next"
import { FriendsScreen } from "@/components/me/friends-screen"

export const metadata: Metadata = { title: "Friends" }

export default function Page() {
  return <FriendsScreen />
}
