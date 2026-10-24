"use client"

import { clearCache } from "@/lib/api/query-client"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { displayName, useMe } from "@/components/me-context"
import { Avatar, Button, PageHeader, ReferralBar, Skeleton } from "@/components/ui/primitives"
import { BellIcon, CameraIcon, ChevronRightIcon, GearIcon, GlobeIcon, ListIcon, PencilIcon, ScaleIcon, ShareIcon, ShopIcon, StarIcon, TargetIcon, TrashIcon } from "@/components/ui/icons"
import { Sheet } from "@/components/ui/sheet"
import { api, errorMessage } from "@/lib/api/client"
import type { BillingResponse, Goal, GoalResponse, SharingResponse, UserResponse } from "@/lib/api/types"
import { prepareImage } from "@/lib/image"
import { useApi } from "@/lib/api/use-api"
import { num1 } from "@/lib/format"
import { useTour } from "@/components/tour/tour"

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
    s.weekly_summary && "weekly summary",
  ].filter(Boolean) as string[]
  if (on.length === 0) return "Nothing shared"
  const text = on.length > 1 ? `${on.slice(0, -1).join(", ")} and ${on[on.length - 1]}` : on[0]
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function MeScreen() {
  const me = useMe()
  const tour = useTour()
  const name = displayName(me)
  const goal = useApi<GoalResponse>("goal")
  const billing = useApi<BillingResponse>("billing")
  const sharing = useApi<SharingResponse>("sharing")
  const [signingOut, setSigningOut] = useState(false)
  const b = billing.data?.billing
  const isPro = b?.plan === "pro"

  async function signOut() {
    setSigningOut(true)
    // Nothing of this account stays on the device.
    clearCache()
    try {
      await fetch("/api/auth/logout", { method: "POST", headers: { Accept: "application/json" } })
    } catch {
      toast.error("Couldn't reach the server, signing out on this device only.")
    }
    window.location.assign("/login")
  }

  return (
    <div className="flex flex-col gap-3">
      <PageHeader back="/today" backLabel="Back to Today" title="Me" titleClassName="text-[30px]" />

      <section aria-label="Profile" className="flex items-center gap-3 rounded-card bg-white p-3.5">
        <ProfilePhoto name={name} url={me.user.avatar_url} />
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
        <Row href="/sharing" icon={<ShareIcon size={20} />} title="Sharing" sub={sharingSummary(sharing.data?.sharing)} />
        <Row href="/shared" icon={<ShareIcon size={20} />} title="Shared" sub="What friends sent you and what you sent" />
        <Row href={`/people/${me.user.id}`} icon={<GlobeIcon size={20} />} title="Your profile" sub="What friends and the Shop see" />
        <Row href="/shop" icon={<ShopIcon size={20} />} title="Shop" sub="Routines, workouts and meals people share" />
        <Row href="/meals" icon={<ListIcon size={20} />} title="My meals" sub="Breakfast, lunch and the rest" />
        <Row href="/saved-meals" icon={<StarIcon size={20} />} title="Saved meals" sub="Logged in one tap" />
        <Row
          href="/photos"
          icon={<CameraIcon size={20} />}
          title="Meal photos"
          sub={b ? (b.photos_limit != null ? `${b.photos_stored} of ${b.photos_limit} kept` : `${b.photos_stored} kept`) : undefined}
        />
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

      <button
        type="button"
        onClick={tour.start}
        className="flex min-h-[48px] items-center justify-center gap-2 rounded-tile bg-white text-[15px] font-semibold text-ink transition-transform duration-[160ms] ease-out active:scale-[0.97]"
      >
        Show me around
      </button>

      <Button variant="outline" size="md" className="border-line font-semibold" onClick={signOut} loading={signingOut}>
        Sign out
      </Button>
      <p className="m-0 text-center text-[12px] text-muted">Signed in as {me.user.email}</p>
    </div>
  )
}

/** The avatar on Me: tap to take, choose or remove a profile photo. */
function ProfilePhoto({ name, url }: { name: string; url: string | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  // Shown until the refreshed layout brings the new avatar_url.
  const [preview, setPreview] = useState<string | null | undefined>(undefined)
  const choose = useRef<HTMLInputElement>(null)
  const take = useRef<HTMLInputElement>(null)
  const shown = preview === undefined ? url : preview
  const uploaded = !!url && url.includes("/avatars/")

  async function upload(file: File | undefined) {
    if (!file) return
    setBusy(true)
    try {
      const img = await prepareImage(file, { maxSide: 512, square: true })
      await api.post<UserResponse>("profile/avatar", { media_type: img.mediaType, data: img.data })
      setPreview(img.previewUrl)
      setOpen(false)
      toast.success("Profile photo updated")
      router.refresh()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      const res = await api.del<UserResponse>("profile/avatar")
      setPreview(res?.user.avatar_url ?? null)
      setOpen(false)
      router.refresh()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const input = (ref: React.RefObject<HTMLInputElement | null>, capture?: "user") => (
    <input
      ref={ref}
      type="file"
      accept="image/*"
      capture={capture}
      className="hidden"
      onChange={(e) => {
        void upload(e.target.files?.[0])
        e.target.value = ""
      }}
    />
  )

  return (
    <>
      <button
        type="button"
        aria-label="Change profile photo"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="relative flex-none rounded-full transition-transform duration-[160ms] ease-out active:scale-[0.95]"
      >
        <Avatar name={name} url={shown} size={52} tone="ink" />
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -bottom-0.5 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-white bg-pink text-ink"
        >
          <PencilIcon size={11} strokeWidth={2.2} />
        </span>
      </button>
      {input(choose)}
      {input(take, "user")}
      <Sheet open={open} onClose={() => !busy && setOpen(false)} title="Profile photo" description="Friends see it on their Friends tab.">
        <div className="flex flex-col gap-2">
          <Button variant="primary" size="md" loading={busy} onClick={() => choose.current?.click()}>
            Choose a photo
          </Button>
          <Button variant="outline" size="md" disabled={busy} onClick={() => take.current?.click()}>
            <CameraIcon size={18} /> Take a photo
          </Button>
          {uploaded ? (
            <Button variant="outline" size="md" className="text-danger" disabled={busy} onClick={remove}>
              <TrashIcon size={18} /> Remove photo
            </Button>
          ) : null}
        </div>
      </Sheet>
    </>
  )
}

function Row({
  href,
  icon,
  title,
  sub,
  last,
  tour,
}: {
  href: string
  icon: React.ReactNode
  title: string
  sub?: string
  last?: boolean
  /** Walkthrough target name. */
  tour?: string
}) {
  return (
    <Link
      href={href}
      data-tour={tour}
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
