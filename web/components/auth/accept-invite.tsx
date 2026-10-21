"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/primitives"
import { api, errorMessage } from "@/lib/api/client"
import type { AcceptInviteResponse } from "@/lib/api/types"

/** Already signed in: POST /v1/invite-links/accept, then go to Friends. */
export function AcceptInvite({ token, inviter }: { token: string; inviter: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      {error ? (
        <p role="alert" className="m-0 rounded-tile bg-night-2 px-3.5 py-3 text-[14px] text-[#F6EDD4]">
          {error}
        </p>
      ) : null}
      <Button
        variant="white"
        loading={busy}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            const res = await api.post<AcceptInviteResponse>("invite-links/accept", { token })
            toast.success(`You and ${res.friend.name || inviter} are now friends`)
            router.push("/friends")
          } catch (err) {
            setError(errorMessage(err))
            setBusy(false)
          }
        }}
      >
        Add {inviter} as a friend
      </Button>
    </>
  )
}
