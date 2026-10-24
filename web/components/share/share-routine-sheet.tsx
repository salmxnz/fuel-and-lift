"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Sheet } from "@/components/ui/sheet"
import { Button } from "@/components/ui/primitives"
import { api, errorMessage, seg } from "@/lib/api/client"
import type { FriendsResponse, Routine } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { FriendPicker, firstName, joinNames } from "./friend-picker"

export function ShareRoutineSheet({
  routine,
  open,
  unsaved,
  onClose,
}: {
  routine: Routine
  open: boolean
  /** The editor has changes that aren't saved yet: they won't be sent. */
  unsaved: boolean
  onClose: () => void
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Share ${routine.name}`}
      description={
        unsaved
          ? "They get the routine as last saved. Save first to send your changes."
          : "They get their own copy of the routine and each workout, with your sets and weights."
      }
    >
      {open ? <ShareRoutineForm routine={routine} onClose={onClose} /> : null}
    </Sheet>
  )
}

function ShareRoutineForm({ routine, onClose }: { routine: Routine; onClose: () => void }) {
  const friends = useApi<FriendsResponse>("friends")
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const list = friends.data?.friends ?? []
  const names = picked.map((id) => list.find((f) => f.id === id)).filter((f) => f !== undefined).map((f) => firstName(f.name))

  async function send() {
    setBusy(true)
    setError(null)
    try {
      await api.post(`routines/${seg(routine.id)}/share`, { friend_ids: picked })
      toast.success(`${routine.name} sent to ${joinNames(names)}`)
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <FriendPicker
        friends={friends.data?.friends}
        loading={friends.loading}
        selected={picked}
        onToggle={(id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))}
      />
      {error ? (
        <p role="alert" className="m-0 text-[14px] font-semibold text-danger">
          {error}
        </p>
      ) : null}
      {list.length > 0 ? (
        <Button onClick={send} loading={busy} disabled={names.length === 0 || busy}>
          {names.length === 0 ? "Pick a friend" : `Send to ${joinNames(names)}`}
        </Button>
      ) : null}
    </div>
  )
}
