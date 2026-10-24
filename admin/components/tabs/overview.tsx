"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingCards } from "@/components/states"
import { useAdminUser } from "@/lib/api/hooks"
import { age, formatDate, kcal } from "@/lib/format"

const ACTIVITY = ["", "Sedentary", "Light", "Moderate", "Active", "Very active", "Athlete"]
const CADENCE: Record<string, string> = { few_per_week: "A few times a week", weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly" }

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  )
}

function Meter({ used, limit }: { used: number; limit: number | null }) {
  if (limit === null) return <span>{used} · unlimited</span>
  const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100))
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full bg-foreground" style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular-nums">
        {used}/{limit}
      </span>
    </span>
  )
}

export function OverviewTab({ id }: { id: string }) {
  const { data } = useAdminUser(id)
  if (!data) return <LoadingCards />
  const { user, profile, goal, billing } = data

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          {profile ? (
            <dl className="divide-y">
              <Row label="Sex, age">
                {profile.sex === "male" ? "Male" : "Female"}, {age(profile.date_of_birth)}
              </Row>
              <Row label="Height">{profile.height_cm} cm</Row>
              <Row label="Activity">{ACTIVITY[profile.activity_level]}</Row>
              <Row label="Units">{profile.units === "metric" ? "Metric" : "Imperial"}</Row>
              <Row label="Time zone">{profile.timezone}</Row>
              <Row label="Weigh-ins">{CADENCE[profile.weigh_in_cadence] ?? profile.weigh_in_cadence}</Row>
              <Row label="Coach voice">{profile.coach_voice === "casual" ? "Casual" : "Neutral"}</Row>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">They haven&apos;t finished onboarding yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Goal</CardTitle>
        </CardHeader>
        <CardContent>
          {goal ? (
            <dl className="divide-y">
              <Row label="Mode">
                {goal.mode === "gain" ? "Gain" : goal.mode === "lose" ? "Lose" : "Maintain"} · {goal.pace}
              </Row>
              <Row label="Weight">
                {goal.start_weight_kg} kg{goal.goal_weight_kg ? ` → ${goal.goal_weight_kg} kg` : ""}
              </Row>
              <Row label="Daily target">{kcal(goal.plan.target_kcal)}</Row>
              <Row label="Protein · carbs · fat">
                {goal.plan.macros.protein_g} · {goal.plan.macros.carbs_g} · {goal.plan.macros.fat_g} g
              </Row>
              <Row label="Started">{formatDate(goal.started_on)}</Row>
              {goal.plan.forecast_date ? <Row label="Forecast">{formatDate(goal.plan.forecast_date)}</Row> : null}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">No active goal.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plan and usage</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            <Row label="Plan">
              {user.is_pro ? `Pro (${user.pro_source ?? "?"})` : "Free"}
              {user.is_pro ? (user.pro_until ? ` until ${formatDate(user.pro_until)}` : ", forever") : ""}
            </Row>
            {!user.is_pro && user.plan === "pro" && user.pro_until ? (
              <Row label="Pro ended">{formatDate(user.pro_until)}</Row>
            ) : null}
            <Row label="Photo estimates this month">
              <Meter used={billing.photo_estimates.used_this_month} limit={billing.photo_estimates.limit_this_month} />
            </Row>
            <Row label="Resets">{formatDate(billing.photo_estimates.resets_on)}</Row>
            <Row label="Photos stored">
              <Meter used={billing.photos_stored} limit={billing.photos_limit} />
            </Row>
            <Row label="Referrals">
              <Meter used={billing.referrals.joined} limit={billing.referrals.needed} />
            </Row>
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}
