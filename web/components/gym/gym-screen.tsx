"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { Avatar, Button, ErrorCard, Field, Skeleton, TextInput } from "@/components/ui/primitives"
import { ChevronRightIcon, DumbbellIcon, PlusIcon } from "@/components/ui/icons"
import { Sheet } from "@/components/ui/sheet"
import { api, errorMessage } from "@/lib/api/client"
import type {
  RoutinesResponse,
  SessionResponse,
  SessionsResponse,
  Template,
  TemplateResponse,
  TemplatesResponse,
  WeeklyPlan,
} from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { addDays, formatDayMonth, relativeDay, todayISO, weekdayKey, type WeekdayKey } from "@/lib/dates"
import { GymWeek } from "./gym-week"
import { IncomingRoutines, IncomingTemplates } from "@/components/share/incoming-shares"
import { VisibilityBadge } from "@/components/community/visibility-select"
import { ShopLink } from "@/components/community/shop-link"
import { Sky, SkyTitle, SKY_ICON } from "@/components/ui/sky"
import { Dumbbell } from "@/components/landing/art"
import { useMe } from "@/components/me-context"
import type { FeedResponse } from "@/lib/api/types"
import { RoutinesSection } from "./routines-section"

const DAY_NAMES: Record<WeekdayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
}

export function summarizeTemplate(t: Template): string {
  if (t.blocks.length === 0) return "No exercises yet"
  const names = [...t.blocks].sort((a, b) => a.position - b.position).map((b) => b.exercise.name)
  return names.length > 3 ? `${names.slice(0, 3).join(", ")} +${names.length - 3}` : names.join(", ")
}

export function GymScreen() {
  const router = useRouter()
  const today = todayISO()
  const templates = useApi<TemplatesResponse>("templates")
  const plan = useApi<WeeklyPlan>("weekly-plan")
  const routines = useApi<RoutinesResponse>("routines")
  const sessions = useApi<SessionsResponse>(`sessions?from=${addDays(today, -14)}&to=${today}`)
  const [starting, setStarting] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)

  const list = templates.data?.templates ?? []
  const byId = new Map(list.map((t) => [t.id, t]))
  const todayKey = weekdayKey(today)
  const todayTemplateId = plan.data?.days[todayKey] ?? null
  const todayTemplate = todayTemplateId ? byId.get(todayTemplateId) : undefined
  const active = (sessions.data?.sessions ?? []).find((s) => s.status === "active")
  const recent = (sessions.data?.sessions ?? []).filter((s) => s.status === "finished").slice(0, 5)

  async function start(templateId: string | null) {
    setStarting(templateId ?? "empty")
    try {
      const res = await api.post<SessionResponse>("sessions", {
        date: today,
        ...(templateId ? { template_id: templateId } : {}),
      })
      router.push(`/gym/session/${res.session.id}`)
    } catch (err) {
      toast.error(errorMessage(err))
      setStarting(null)
    }
  }

  async function setDay(day: WeekdayKey, templateId: string | null) {
    if (!plan.data) return
    const prev = plan.data
    const next: WeeklyPlan = { days: { ...prev.days, [day]: templateId } }
    plan.setData(next)
    try {
      await api.put("weekly-plan", next)
    } catch (err) {
      plan.setData(prev)
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      <Sky className="pb-12">
        <SkyTitle title="Gym">
          <ShopLink kind="routine" className={SKY_ICON} />
        </SkyTitle>
        <FriendsAtTheGym />
      </Sky>

      <IncomingRoutines
        onAdded={(r) => {
          routines.setData((prev) => ({ routines: [r, ...(prev?.routines ?? [])] }))
          void templates.reload()
        }}
      />

      <IncomingTemplates
        onAdded={(t) =>
          templates.setData((prev) => ({
            templates: [...(prev?.templates ?? []), t].sort((a, b) => a.name.localeCompare(b.name)),
          }))
        }
      />

      {/* Today */}
      {templates.loading || plan.loading || sessions.loading ? (
        <Skeleton className="h-[120px] rounded-card" />
      ) : active ? (
        <section aria-label="Workout in progress" className="flex flex-col gap-3 rounded-card bg-ink p-4 text-white">
          <span className="text-[13px] text-night-muted">In progress · {relativeDay(active.started_at)}</span>
          <span className="text-[22px] font-extrabold tracking-[-0.01em]">{active.template_name ?? "Workout"}</span>
          <Link
            href={`/gym/session/${active.id}`}
            className="flex min-h-[52px] items-center justify-center rounded-btn bg-pink text-[16px] font-bold text-ink no-underline"
          >
            Resume workout
          </Link>
        </section>
      ) : todayTemplate ? (
        <section aria-label="Today's workout" className="flex flex-col gap-3 rounded-card bg-ink p-4 text-white">
          <span className="text-[13px] text-night-muted">{DAY_NAMES[todayKey]}</span>
          <span className="text-[22px] font-extrabold tracking-[-0.01em]">
            {todayTemplate.name} <span className="text-[13px] font-semibold text-night-muted">v{todayTemplate.version}</span>
          </span>
          <span className="text-[13px] text-night-soft">{summarizeTemplate(todayTemplate)}</span>
          <Button variant="pink" onClick={() => start(todayTemplate.id)} loading={starting === todayTemplate.id}>
            Start today&apos;s workout
          </Button>
        </section>
      ) : (
        <section aria-label="Today" className="flex flex-col gap-2 rounded-card border-[1.5px] border-dashed border-dash p-4">
          <span className="text-[13px] font-semibold text-muted">{DAY_NAMES[todayKey]}</span>
          <span className="text-[15px]">
            {list.length === 0
              ? "Make your first workout, then put it on your week."
              : "Rest day. Recover, or start any workout below if you're itching to train."}
          </span>
        </section>
      )}

      {templates.error && !templates.data ? (
        <ErrorCard message={templates.error.message} onRetry={() => void templates.reload()} />
      ) : null}

      {/* Weekly plan */}
      {plan.error && !plan.data ? (
        <p className="m-0 rounded-card bg-white p-3.5 text-[14px] text-danger">{plan.error.message}</p>
      ) : (
        <GymWeek
          plan={plan.data ?? null}
          templates={list}
          onSetDay={setDay}
          onStart={(id) => void start(id)}
          starting={starting}
        />
      )}

      <RoutinesSection
        routines={routines}
        plan={plan.data ?? null}
        onPlanChange={(days) => plan.setData({ days })}
        onTemplatesChanged={() => void templates.reload()}
      />

      {/* Templates */}
      <div className="-mb-1 mt-1 flex items-center justify-between">
        <h2 className="m-0 text-[17px] font-extrabold">Templates</h2>
        <button
          type="button"
          onClick={() => setNewOpen(true)}
          className="flex min-h-[36px] items-center gap-1.5 rounded-full border-[1.5px] border-dashed border-dash px-3 text-[13px] font-semibold"
        >
          <PlusIcon size={16} /> New template
        </button>
      </div>
      {templates.loading ? (
        <Skeleton className="h-[86px] rounded-card" />
      ) : list.length === 0 ? (
        <div className="rounded-card border-[1.5px] border-dashed border-dash p-4 text-[15px] text-muted">
          No templates yet. A template is a list of exercises with sets and weights, like “Upper-1”.
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {list.map((t) => (
            <li key={t.id} className="flex items-center gap-2 rounded-card bg-white p-2 pl-4">
              <Link href={`/gym/templates/${t.id}`} className="flex min-h-[56px] min-w-0 flex-1 flex-col justify-center no-underline">
                <span className="flex flex-wrap items-center gap-1.5 text-[16px] font-bold">
                  <span>
                    {t.name} <span className="text-[12px] font-semibold text-muted">v{t.version}</span>
                  </span>
                  <VisibilityBadge visibility={t.visibility} hidden={t.hidden} />
                </span>
                <span className="truncate text-[13px] text-muted">{summarizeTemplate(t)}</span>
              </Link>
              <Button
                size="sm"
                variant="outline"
                onClick={() => start(t.id)}
                loading={starting === t.id}
                disabled={starting !== null || t.blocks.length === 0}
                aria-label={`Start ${t.name}`}
              >
                Start
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* Recent */}
      {recent.length > 0 ? (
        <section aria-labelledby="recent-title" className="flex flex-col rounded-card bg-white px-3.5 py-1">
          <h2 id="recent-title" className="m-0 pb-1 pt-3 text-[13px] font-semibold text-muted">
            Last two weeks
          </h2>
          {recent.map((s) => {
            const done = s.blocks.filter((b) => !b.skipped).length
            return (
              <div key={s.id} className="flex min-h-[48px] items-center justify-between gap-3 border-b border-line-soft text-[14px] last:border-b-0">
                <span className="flex items-center gap-2">
                  <DumbbellIcon size={18} className="text-muted" />
                  <span className="font-semibold">{s.template_name ?? "Workout"}</span>
                </span>
                <span className="text-muted">
                  {formatDayMonth(s.date)} · {done} exercise{done === 1 ? "" : "s"}
                </span>
              </div>
            )
          })}
        </section>
      ) : null}

      <Link
        href="/progress"
        className="flex min-h-[48px] items-center justify-between rounded-tile border border-line px-3.5 text-[15px] font-semibold no-underline"
      >
        Strength progress and records
        <ChevronRightIcon size={18} className="text-muted" />
      </Link>

      <NewTemplateSheet open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  )
}

function NewTemplateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  return (
    <Sheet open={open} onClose={onClose} title="New template" description="Name it after the day or the split, like “Upper-1” or “Legs”.">
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault()
          const n = name.trim()
          if (!n) return
          setBusy(true)
          try {
            const res = await api.post<TemplateResponse>("templates", { name: n, blocks: [] })
            router.push(`/gym/templates/${res.template.id}`)
          } catch (err) {
            toast.error(errorMessage(err))
            setBusy(false)
          }
        }}
      >
        <Field label="Name" htmlFor="tpl-name">
          <TextInput id="tpl-name" data-autofocus value={name} maxLength={40} placeholder="Upper-1" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button type="submit" loading={busy} disabled={!name.trim()}>
          Create and add exercises
        </Button>
      </form>
    </Sheet>
  )
}

/** Friends training right now (tap to train together), else a floating dumbbell. */
function FriendsAtTheGym() {
  const me = useMe()
  const feed = useApi<FeedResponse>("feed")
  const live = (feed.data?.items ?? []).filter(
    (it, i, a) => it.kind === "workout_started" && it.actor.id !== me.user.id && a.findIndex((x) => x.kind === it.kind && x.actor.id === it.actor.id) === i
  )
  if (live.length === 0) {
    return (
      <div aria-hidden="true" className="relative mt-1 h-[64px]">
        <div className="app-float absolute right-6 top-0 w-[112px]" style={{ "--r": "-16deg", "--t": "6s" } as React.CSSProperties}>
          <Dumbbell className="w-full drop-shadow-[0_10px_18px_rgba(46,26,36,0.22)]" />
        </div>
      </div>
    )
  }
  return (
    <div className="mt-3 flex flex-col gap-2">
      <span className="flex items-center gap-2 text-[13px] font-bold text-protein">
        <span aria-hidden="true" className="live-dot h-2.5 w-2.5 rounded-full bg-protein" />
        Your crew is training
      </span>
      <ul className="no-scrollbar -mx-4 m-0 flex list-none gap-2 overflow-x-auto px-4 pb-1">
        {live.map((t) => (
          <li key={t.id} className="flex-none">
            <Link
              href={`/people/${t.actor.id}`}
              className="flex min-h-[56px] items-center gap-2.5 rounded-[18px] border border-white/85 bg-white/70 py-2 pl-2 pr-3.5 text-ink no-underline backdrop-blur-md"
            >
              <Avatar name={t.actor.name} url={t.actor.avatar_url} size={36} tone="lilac" />
              <span className="flex flex-col">
                <span className="text-[14px] font-extrabold">{t.actor.name}</span>
                <span className="text-[12px] text-muted">{typeof t.data.template === "string" ? t.data.template : "Training"} · join</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
