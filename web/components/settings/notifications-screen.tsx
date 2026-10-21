"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { ErrorCard, PageHeader, Skeleton, Switch } from "@/components/ui/primitives"
import { ShareIcon } from "@/components/ui/icons"
import { api, errorMessage } from "@/lib/api/client"
import type { NotificationPrefs, NotificationPrefsResponse } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { currentSubscription, disablePush, enablePush, pushSupport } from "@/lib/push"

const ROWS: { key: keyof NotificationPrefs; title: string; sub: string }[] = [
  { key: "friend_workouts", title: "When friends work out", sub: "Choose which friends in Friends" },
  { key: "cheers", title: "Cheers", sub: "When a friend cheers your workout" },
  { key: "meal_nudges", title: "Meal reminders", sub: "If a usual meal isn't logged by its usual time" },
  { key: "workout_day", title: "Workout days", sub: "A nudge on days your plan has a workout" },
  { key: "weigh_in", title: "Weigh-in reminders", sub: "Matches how often you weigh in" },
  { key: "weekly_checkin", title: "Weekly check-in", sub: "How the week went against your plan" },
]

type DeviceState = "checking" | "on" | "off" | "ios-install" | "unsupported" | "denied"

export function NotificationsScreen() {
  const prefs = useApi<NotificationPrefsResponse>("notification-prefs")
  const [device, setDevice] = useState<DeviceState>("checking")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    const support = pushSupport()
    if (!support.ok) {
      queueMicrotask(() => {
        if (!cancelled)
          setDevice(support.reason === "ios-not-installed" ? "ios-install" : support.reason === "denied" ? "denied" : "unsupported")
      })
    } else {
      void currentSubscription().then((sub) => {
        if (!cancelled) setDevice(sub ? "on" : "off")
      })
    }
    return () => {
      cancelled = true
    }
  }, [])

  async function save(next: NotificationPrefs) {
    const prev = prefs.data?.prefs
    prefs.setData({ prefs: next })
    try {
      prefs.setData(await api.put<NotificationPrefsResponse>("notification-prefs", next))
    } catch (err) {
      if (prev) prefs.setData({ prefs: prev })
      toast.error(errorMessage(err))
    }
  }

  async function toggleDevice() {
    setBusy(true)
    try {
      if (device === "on") {
        await disablePush()
        setDevice("off")
        toast.success("Notifications off on this device")
      } else {
        await enablePush()
        setDevice("on")
        toast.success("Notifications on")
      }
    } catch (err) {
      toast.error(errorMessage(err))
      if (typeof Notification !== "undefined" && Notification.permission === "denied") setDevice("denied")
    } finally {
      setBusy(false)
    }
  }

  const p = prefs.data?.prefs

  return (
    <div className="flex flex-col gap-3">
      <PageHeader back="/me" backLabel="Back to Me" eyebrow="Me" title="Notifications" />

      <section aria-label="This device" className="flex flex-col gap-3 rounded-card bg-white p-3.5">
        <span className="text-[13px] font-semibold text-muted">This device</span>
        {device === "checking" ? (
          <Skeleton className="h-12" />
        ) : device === "ios-install" ? (
          <IOSInstallSteps />
        ) : device === "unsupported" ? (
          <p className="m-0 text-[14px] text-muted">This browser can&apos;t show push notifications.</p>
        ) : device === "denied" ? (
          <p className="m-0 text-[14px] text-muted">
            Notifications are blocked for Fuel &amp; Lift. Allow them in your browser or phone settings, then come back.
          </p>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span id="device-push" className="text-[15px] font-bold">
              Push notifications
            </span>
            {busy ? (
              <Skeleton className="h-8 w-[52px] rounded-full" />
            ) : (
              <Switch checked={device === "on"} onChange={toggleDevice} labelledBy="device-push" />
            )}
          </div>
        )}
      </section>

      {prefs.error && !p ? (
        <ErrorCard message={prefs.error.message} onRetry={() => void prefs.reload()} />
      ) : !p ? (
        <Skeleton className="h-[360px] rounded-card" />
      ) : (
        <>
          <section aria-label="What to send" className="flex flex-col rounded-card bg-white px-3.5 py-0.5">
            {ROWS.map((r) => {
              const id = `pref-${r.key}`
              return (
                <div key={r.key} className="flex min-h-16 items-center gap-3 border-b border-line-soft last:border-b-0">
                  <div className="flex flex-1 flex-col gap-0.5 py-2">
                    <span id={id} className="text-[15px] font-bold">
                      {r.title}
                    </span>
                    <span className="text-[12px] text-muted">{r.sub}</span>
                  </div>
                  <Switch checked={!!p[r.key]} onChange={(v) => save({ ...p, [r.key]: v })} labelledBy={id} />
                </div>
              )
            })}
          </section>

          <section aria-label="Quiet hours" className="flex flex-col gap-3 rounded-card bg-white p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <span id="quiet" className="text-[15px] font-bold">
                  Quiet hours
                </span>
                <span className="text-[12px] text-muted">No notifications in this window</span>
              </div>
              <Switch
                checked={!!(p.quiet_from && p.quiet_to)}
                onChange={(v) => save({ ...p, quiet_from: v ? "22:00" : null, quiet_to: v ? "07:00" : null })}
                labelledBy="quiet"
              />
            </div>
            {p.quiet_from && p.quiet_to ? (
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-[12px] text-muted">
                  From
                  <input
                    type="time"
                    value={p.quiet_from}
                    onChange={(e) => e.target.value && save({ ...p, quiet_from: e.target.value })}
                    className="min-h-11 rounded-[12px] border border-line bg-white px-2.5 text-[15px] text-ink"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[12px] text-muted">
                  To
                  <input
                    type="time"
                    value={p.quiet_to}
                    onChange={(e) => e.target.value && save({ ...p, quiet_to: e.target.value })}
                    className="min-h-11 rounded-[12px] border border-line bg-white px-2.5 text-[15px] text-ink"
                  />
                </label>
              </div>
            ) : null}
          </section>
        </>
      )}
    </div>
  )
}

/** iOS Safari: push needs the app on the Home Screen first. */
export function IOSInstallSteps({ compact }: { compact?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      {!compact ? (
        <p className="m-0 text-[14px] leading-[1.45]">On iPhone, notifications only work from the Home Screen app.</p>
      ) : null}
      <ol className="m-0 flex list-none flex-col gap-2 p-0 text-[14px]">
        <li className="flex items-center gap-2.5">
          <Step n={1} /> Tap <ShareIcon size={18} className="inline" aria-label="Share" /> <strong>Share</strong> in Safari&apos;s toolbar
        </li>
        <li className="flex items-center gap-2.5">
          <Step n={2} /> Choose <strong>Add to Home Screen</strong>
        </li>
        <li className="flex items-center gap-2.5">
          <Step n={3} /> Open Fuel &amp; Lift from your Home Screen
        </li>
      </ol>
    </div>
  )
}

function Step({ n }: { n: number }) {
  return (
    <span aria-hidden="true" className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-lime text-[12px] font-extrabold text-ink">
      {n}
    </span>
  )
}

