"use client"

import { Avatar, ErrorCard, LoadingBlock, PageHeader } from "@/components/ui/primitives"
import { ShopCard, KIND_LABEL } from "@/components/shop/shop-card"
import { seg } from "@/lib/api/client"
import type { PersonViewResponse, ShopItem, ShopKind } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { formatMonthYear } from "@/lib/dates"

/** Someone's profile: their routines, workouts and meals shared with you. */
export function PersonScreen({ id }: { id: string }) {
  const res = useApi<PersonViewResponse>(`people/${seg(id)}`)

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
      <PageHeader back="history" title={v.is_me ? "Your profile" : "Profile"} />

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
    </main>
  )
}
