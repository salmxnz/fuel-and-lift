import type { Metadata } from "next"
import { AddFriendScreen } from "@/components/me/add-friend-screen"

export const metadata: Metadata = { title: "Add a friend" }

export default function Page() {
  return <AddFriendScreen />
}
