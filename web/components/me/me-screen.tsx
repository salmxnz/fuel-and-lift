"use client"

import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"
import { displayName, useMe } from "@/components/me-context"
import { Avatar, Button, ReferralBar, Skeleton } from "@/components/ui/primitives"
import {
  BellIcon,
  ChevronRightIcon,
  FriendsIcon,
  GearIcon,
  ListIcon,
  ScaleIcon,
  ShareIcon,
  StarIcon,
  TargetIcon,
} from "@/components/ui/icons"
import type { BillingResponse, Goal, GoalResponse, SharingResponse } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { num1 } from "@/lib/format"

export function goalSentence(goal: Goal | null | undefined): string {
  if (!goal) return "No goal set"
  const pace = goal.pace === "standard" ? "standard pace" : `${goal.pace} pace`
  if (goal.mode === "maintain") return "Maintaining weight"
  const verb = goal.mode === "gain" ? "Gaining" : "Losing"
  return goal.goal_weight_kg != null ? `${verb} to ${num1(goal.goal_weight_kg)} kg, ${pace}` : `${verb}, ${pace}`
}

function sharingSummary(s: SharingResponse["sharing"] | undefined): string {
  if (!s) return ""
  const on = [
    s.workouts && "Workouts",
    s.records && "records",
    s.weight_trend && "weight trend",
    s.food_streaks && "food streaks",
  ].filter(Boolean) as string[]
  if (on.length === 0) return "Nothing shared"
  const text = on.length > 1 ? `${on.slice(0, -1).join(", ")} and ${on[on.length - 1]}` : on[0]
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function MeScreen() {
  const me = useMe()
  const name = displayName(me)
  const goal = useApi<GoalResponse>("goal")
  const billing = useApi<BillingResponse>("billing")
  const sharing = useApi<SharingResponse>("sharing")
  const [signingOut, setSigningOut] = useState(false)
  const b = billing.data?.billing
  const isPro = b?.plan === "pro"

  async function signOut() {
    setSigningOut(true)
    try {
      await fetch("/api/auth/logout", { method: "POST", headers: { Accept: "application/json" } })
    } catch {
      toast.error("Couldn't reach the server, signing out on this device only.")
    }
    window.location.assign("/login")
  }

  return (
    <div className="flex flex-col gap-3">
      <h1 className="m-0 text-[30px] font-extrabold tracking-[-0.02em]">Me</h1>

      <section aria-label="Profile" className="flex items-center gap-3 rounded-card bg-white p-3.5">
        <Avatar name={name} url={me.user.avatar_url} size={52} tone="ink" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[18px] font-extrabold">{name}</span>
          {goal.loading ? (
            <Skeleton className="h-4 w-40" />
          ) : (
            <span className="text-[13px] text-muted">{goalSentence(goal.data?.goal)}</span>
          )}
        </div>
        {b ? (
          <span
            className={
              isPro
                ? "rounded-full bg-pink px-2 py-1 text-[12px] font-extrabold text-ink"
                : "rounded-full border border-line px-2 py-1 text-[12px] font-bold text-muted"
            }
          >
            {isPro ? "Pro" : "Free"}
          </span>
        ) : null}
      </section>

      {billing.loading ? (
        <Skeleton className="h-[112px] rounded-card" />
      ) : b && !isPro ? (
        <Link href="/pro" className="flex flex-col gap-2.5 rounded-card bg-ink p-3.5 text-white no-underline">
          <span className="flex items-baseline justify-between">
            <span className="text-[15px] font-bold">Pro forever, free</span>
            <span className="text-[13px] font-bold text-pink">
              {b.referrals.joined} of {b.referrals.needed} friends
            </span>
          </span>
          <ReferralBar joined={b.referrals.joined} needed={b.referrals.needed} />
          <span className="text-[13px] text-night-muted">
            Invite {b.referrals.needed} friends who join and you get Pro for good. Free plan:{" "}
            {b.photo_estimates.limit_this_month ?? 10} photo estimates a month ({b.photo_estimates.used_this_month} used).
          </span>
        </Link>
      ) : b && isPro ? (
        <Link href="/pro" className="flex items-center gap-3 rounded-card bg-ink p-3.5 text-white no-underline">
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[12px] bg-pink text-[13px] font-extrabold text-ink">
            PRO
          </span>
          <span className="flex flex-1 flex-col">
            <span className="text-[15px] font-bold">You&apos;re on Pro</span>
            <span className="text-[13px] text-night-muted">Unlimited photo estimates</span>
          </span>
          <ChevronRightIcon size={16} className="text-night-muted" />
        </Link>
      ) : null}

      <nav aria-label="Settings" className="flex flex-col rounded-card bg-white px-3.5 py-0.5">
        <Row href="/friends" icon={<FriendsIcon size={20} />} title="Friends" />
        <Row href="/sharing" icon={<ShareIcon size={20} />} title="Sharing" sub={sharingSummary(sharing.data?.sharing)} />
        <Row href="/meals" icon={<ListIcon size={20} />} title="My meals" sub="Breakfast, lunch and the rest" />
        <Row href="/saved-meals" icon={<StarIcon size={20} />} title="Saved meals" sub="Logged in one tap" />
        <Row href="/settings/goal" icon={<TargetIcon size={20} />} title="Goal and targets" />
        <Row href="/weigh-in" icon={<ScaleIcon size={20} />} title="Weigh-in" />
        <Row href="/settings/notifications" icon={<BellIcon size={20} />} title="Notifications" />
        <Row
          href="/settings/profile"
          icon={<GearIcon size={20} />}
          title="Units and time zone"
          sub={me.profile ? `${me.profile.units === "imperial" ? "lb, ft" : "kg, cm"}, ${me.profile.timezone}` : undefined}
          last
        />
      </nav>

      <Button variant="outline" size="md" className="border-line font-semibold" onClick={signOut} loading={signingOut}>
        Sign out
      </Button>
      <p className="m-0 text-center text-[12px] text-muted">Signed in as {me.user.email}</p>
    </div>
  )
}

function Row({
  href,
  icon,
  title,
  sub,
  last,
}: {
  href: string
  icon: React.ReactNode
  title: string
  sub?: string
  last?: boolean
}) {
  return (
    <Link
      href={href}
      className={`flex min-h-[52px] items-center gap-3 text-ink no-underline ${last ? "" : "border-b border-line-soft"}`}
    >
      {icon}
      <span className="flex flex-1 flex-col py-1.5">
        <span className="text-[15px] font-semibold">{title}</span>
        {sub ? <span className="text-[12px] text-muted">{sub}</span> : null}
      </span>
      <ChevronRightIcon size={16} className="text-muted" />
    </Link>
  )
}
