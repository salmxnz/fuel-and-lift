// TypeScript mirror of the parts of docs/api.md the admin app uses (mostly
// "Admin: users"). Shapes shared with the PWA match web/lib/api/types.ts.

export type Role = "admin" | "member"
export type ProSource = "admin" | "referrals" | "subscription"

export type User = { id: string; email: string; name: string; avatar_url: string | null; role: Role | string }

export type AuthGoogleResponse = { access_token: string; csrf_token: string; user: User; onboarded: boolean }
export type AuthRefreshResponse = { access_token: string; csrf_token: string }
export type MeResponse = { user: User; onboarded: boolean }

export type Person = { id: string; name: string; avatar_url: string | null }

// ---------------------------------------------------------------- Admin users

export type AdminUser = {
  id: string
  email: string
  /** The Google name. */
  name: string
  /** null before onboarding. */
  display_name: string | null
  avatar_url: string | null
  role: Role
  /** As stored; is_pro accounts for an expired pro_until. */
  plan: "free" | "pro"
  pro_source: ProSource | null
  /** null = forever. */
  pro_until: string | null
  is_pro: boolean
  /** In ADMIN_EMAILS: always admin with Pro, whatever is set here. */
  admin_email: boolean
  onboarded: boolean
  invited_by: Person | null
  created_at: string
  last_login_at: string | null
  suspended_at: string | null
  suspended_reason: string | null
  counts: {
    saved_meals: number
    templates: number
    routines: number
    sessions_finished: number
    friends: number
    referrals: number
  }
}

export type AdminUsersResponse = { users: AdminUser[]; total: number }
export type AdminUserResponse = { user: AdminUser }
export type AdminUserDetail = { user: AdminUser; billing: Billing; profile: Profile | null; goal: Goal | null }

export type UserFilter = { q: string; plan: "" | "free" | "pro"; role: "" | Role; status: "" | "active" | "suspended" }

// ---------------------------------------------------------------- Profile, goal, billing

export type Profile = {
  display_name: string
  sex: "male" | "female"
  date_of_birth: string
  height_cm: number
  activity_level: 1 | 2 | 3 | 4 | 5 | 6
  units: "metric" | "imperial"
  timezone: string
  coach_voice: "neutral" | "casual"
  weigh_in_cadence: "few_per_week" | "weekly" | "monthly" | "quarterly"
  tour_done_at: string | null
}

export type Goal = {
  id: string
  mode: "gain" | "lose" | "maintain"
  start_weight_kg: number
  goal_weight_kg: number | null
  pace: "slow" | "standard" | "fast"
  started_on: string
  plan: {
    target_kcal: number
    maintenance_kcal: number
    rate_kg_per_week: number
    forecast_date: string | null
    macros: { protein_g: number; fat_g: number; carbs_g: number }
  }
}

export type Billing = {
  plan: "free" | "pro"
  pro_source: ProSource | null
  pro_until: string | null
  photo_estimates: { used_this_month: number; limit_this_month: number | null; resets_on: string }
  referrals: { joined: number; needed: number }
  photos_stored: number
  photos_limit: number | null
}

// ---------------------------------------------------------------- Community

export type Visibility = "private" | "friends" | "public"
export type ShopKind = "meal" | "template" | "routine"

export type Community = {
  visibility: Visibility
  published_at: string | null
  add_count: number
  /** A moderator removed it from the Shop; only the owner still sees it. */
  hidden: boolean
  copied_from: Person | null
}

// ---------------------------------------------------------------- Food

export type Macros = { kcal: number; protein_g: number; carbs_g: number; fat_g: number }

export type EntryItem = Macros & { name: string; grams: number | null; assumption: string | null; source: string }

export type Entry = Macros & {
  id: string
  date: string
  meal_slot_id: string | null
  meal_name: string
  name: string
  origin: string
  items: EntryItem[]
  logged_at: string
}
export type EntriesResponse = { entries: Entry[]; from: string; to: string }

export type SavedMeal = {
  id: string
  name: string
  items: (EntryItem & { id: string; is_addon: boolean })[]
  base: Macros
  last_used_at: string | null
} & Community
export type SavedMealsResponse = { saved_meals: SavedMeal[] }

// ---------------------------------------------------------------- Gym

export type Exercise = { id: string; name: string; kind: "strength" | "cardio"; muscle_group: string | null; equipment: string | null }
export type PlannedSet = { warmup: boolean; target_kg: number | null; target_reps: number | null; to_failure: boolean }
export type Cardio = { minutes: number; incline: number | null; speed: number | null }

export type TemplateBlock = {
  id: string
  position: number
  exercise: Exercise
  sets: PlannedSet[]
  cardio: Cardio | null
  rest_seconds: number | null
  notes: string | null
}

export type Template = {
  id: string
  name: string
  version: number
  current_version: number
  blocks: TemplateBlock[]
  updated_at: string
} & Community
export type TemplatesResponse = { templates: Template[] }

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"
export const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

export type Routine = {
  id: string
  name: string
  description: string | null
  preset: string | null
  days: Record<Weekday, { template_id: string; name: string } | null>
  created_at: string
  updated_at: string
} & Community
export type RoutinesResponse = { routines: Routine[] }

export type SessionSet = {
  id: string
  position: number
  warmup: boolean
  target_kg: number | null
  target_reps: number | null
  to_failure: boolean
  actual_kg: number | null
  actual_reps: number | null
  done: boolean
}

export type Session = {
  id: string
  date: string
  template_id: string | null
  template_name: string | null
  template_version: number | null
  status: "active" | "finished"
  started_at: string
  finished_at: string | null
  blocks: { id: string; position: number; exercise: Exercise; skipped: boolean; cardio: Cardio | null; cardio_done: boolean; sets: SessionSet[] }[]
}
export type SessionsResponse = { sessions: Session[]; from: string; to: string }
export type SessionResponse = { session: Session }

// ---------------------------------------------------------------- Friends

export type Friend = {
  id: string
  name: string
  avatar_url: string | null
  since: string
  last_workout_on: string | null
  notify_workouts: boolean
}
export type FriendsResponse = { friends: Friend[] }
