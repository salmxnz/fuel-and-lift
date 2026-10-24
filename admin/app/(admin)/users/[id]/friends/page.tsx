import { Suspense } from "react"
import { FriendsTab } from "@/components/tabs/friends"

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Suspense>
      <FriendsTab id={id} />
    </Suspense>
  )
}
