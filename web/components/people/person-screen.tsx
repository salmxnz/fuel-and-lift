"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { Avatar, Button, ErrorCard, LoadingBlock, PageHeader, Switch } from "@/components/ui/primitives"
import { MoreIcon } from "@/components/ui/icons"
import { Sheet } from "@/components/ui/sheet"
import { ShopCard, KIND_LABEL } from "@/components/shop/shop-card"
import { WeekCard } from "@/components/friends/week-card"
import { api, errorMessage, seg } from "@/lib/api/client"
import type { FriendResponse, FriendsResponse, PersonViewResponse, ShopItem, ShopKind } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { formatMonthYear } from "@/lib/dates"

/** Someone's profile: their week, and the routines, workouts and meals shared with you. */
export function PersonScreen({ id }: { id: string }) {
  const res = useApi<PersonViewResponse>(`people/${seg(id)}`)
  const [menuOpen, setMenuOpen] = useState(false)

  if (res.error && !res.data) {
    return (
      <main className="app-column pb-safe flex flex-col gap-4">
        <PageHeader back="history" title="Profile" />
        <ErrorCard
          message={res.error.status === 404 ? "Nothing to see here: they haven't shared anything with you." : res.error.message}
          onRetry={res.error.status === 404 ? undefined : () => void res.reload()}
        />
      </main>
    )
  }
  if (!res.data) {
    return (
      <main className="app-column">
        <LoadingBlock label="Loading profile" />
      </main>
    )
  }

  const v = res.data
  const sections: { kind: ShopKind; items: ShopItem[] }[] = [
    { kind: "routine", items: v.routines },
    { kind: "template", items: v.templates },
    { kind: "meal", items: v.meals },
  ]
  const total = v.routines.length + v.templates.length + v.meals.length

  return (
    <main className="app-column pb-safe flex min-h-dvh flex-col gap-4">
      <PageHeader
        back="history"
        title={v.is_me ? "Your profile" : "Profile"}
        right={
          v.is_friend ? (
            <button
              type="button"
              aria-label={`Options for ${v.person.name}`}
              aria-haspopup="dialog"
              onClick={() => setMenuOpen(true)}
              className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-white text-ink transition-transform duration-[160ms] ease-out active:scale-[0.95]"
            >
              <MoreIcon size={22} />
            </button>
          ) : null
        }
      />

      <section className="flex flex-col items-center gap-2 py-2 text-center">
        <Avatar name={v.person.name} url={v.person.avatar_url} size={80} />
        <h2 className="m-0 text-[24px] font-extrabold tracking-[-0.02em]">{v.person.name}</h2>
        <span className="text-[14px] text-muted">
          {v.is_me
            ? "What friends and the Shop see of you"
            : v.is_friend && v.friends_since
              ? `Friends since ${formatMonthYear(v.friends_since)}`
              : "Shares in the Shop"}
        </span>
      </section>

      {v.is_me || v.is_friend ? (
        <section aria-labelledby="p-week" className="flex flex-col gap-2">
          <h3 id="p-week" className="m-0 text-[17px] font-extrabold">
            This week
          </h3>
          <WeekCard person={v.person} summary={v.summary} isMe={v.is_me} />
          {v.is_me ? (
            <p className="m-0 text-[12px] text-muted">Friends see this unless you turn off Weekly summary in Sharing. Never calories.</p>
          ) : null}
        </section>
      ) : null}

      {total === 0 ? (
        <p className="m-0 rounded-card border-[1.5px] border-dashed border-dash p-4 text-[15px] text-muted">
          {v.is_me
            ? "You haven't shared anything yet. Set a workout, meal or routine to Friends only or Public and it shows here."
            : "Nothing shared yet. When they set a workout, meal or routine to Friends only or Public, it shows up here."}
        </p>
      ) : (
        sections
          .filter((s) => s.items.length > 0)
          .map((s) => (
            <section key={s.kind} aria-labelledby={`p-${s.kind}`} className="flex flex-col gap-2">
              <h3 id={`p-${s.kind}`} className="m-0 text-[17px] font-extrabold">
                {KIND_LABEL[s.kind]} <span className="text-[13px] font-semibold text-muted">{s.items.length}</span>
              </h3>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {s.items.map((it) => (
                  <li key={it.id}>
                    <ShopCard item={it} showCreator={false} />
                  </li>
                ))}
              </ul>
            </section>
          ))
      )}

      {v.is_friend ? (
        <FriendMenu open={menuOpen} onClose={() => setMenuOpen(false)} id={v.person.id} name={v.person.name} />
      ) : null}
    </main>
  )
}

/** Per-friend settings: workout pushes and removing them. */
function FriendMenu({ open, onClose, id, name }: { open: boolean; onClose: () => void; id: string; name: string }) {
  const router = useRouter()
  const friends = useApi<FriendsResponse>("friends")
  const friend = friends.data?.friends.find((f) => f.id === id)
  const [removing, setRemoving] = useState(false)

  async function setNotify(notify: boolean) {
    const update = (n: boolean) =>
      friends.setData((prev) => ({ friends: (prev?.friends ?? []).map((f) => (f.id === id ? { ...f, notify_workouts: n } : f)) }))
    update(notify)
    try {
      const res = await api.patch<FriendResponse>(`friends/${seg(id)}`, { notify_workouts: notify })
      friends.setData((prev) => ({ friends: (prev?.friends ?? []).map((f) => (f.id === id ? res.friend : f)) }))
    } catch (err) {
      update(!notify)
      toast.error(errorMessage(err))
    }
  }

  async function remove() {
    setRemoving(true)
    try {
      await api.del(`friends/${seg(id)}`)
      toast.success(`You and ${name} are no longer friends`)
      onClose()
      router.replace("/friends")
    } catch (err) {
      toast.error(errorMessage(err))
      setRemoving(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={name}>
      <div className="flex flex-col gap-3">
        <div className="flex min-h-[56px] items-center gap-3 rounded-tile bg-white px-3.5">
          <span id={`notify-${id}`} className="flex flex-1 flex-col py-2">
            <span className="text-[15px] font-semibold">Notify me when they work out</span>
            <span className="text-[12px] text-muted">A push when {name} finishes a workout</span>
          </span>
          <Switch
            checked={friend?.notify_workouts ?? true}
            disabled={!friend}
            onChange={setNotify}
            labelledBy={`notify-${id}`}
          />
        </div>
        <Button variant="danger" size="md" onClick={remove} loading={removing}>
          Remove friend
        </Button>
      </div>
    </Sheet>
  )
}
