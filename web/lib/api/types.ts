// TypeScript mirror of docs/api.md. snake_case keys, dates YYYY-MM-DD,
// timestamps RFC 3339, ids are UUID strings, weights kg, energy kcal, macros g.

export type ApiErrorBody = { error: { message: string; code?: string } }

// ---------------------------------------------------------------- Auth

export type Role = "admin" | "member"

export type User = {
  id: string
  email: string
  name: string
  avatar_url: string | null
  role: Role | string
}

export type UserResponse = { user: User }

export type AuthGoogleRequest =
  | { code: string; code_verifier: string; redirect_uri: string; invite_token?: string }
  | { id_token: string; invite_token?: string }

export type AuthGoogleResponse = {
  access_token: string
  csrf_token: string
  user: User
  onboarded: boolean
}

export type AuthRefreshResponse = { access_token: string; csrf_token: string }

export type MeResponse = { user: User; onboarded: boolean; profile: Profile | null }

// ---------------------------------------------------------------- Profile / plan

export type Sex = "male" | "female"
export type Mode = "gain" | "lose" | "maintain"
export type Pace = "slow" | "standard" | "fast"
export type ActivityLevel = 1 | 2 | 3 | 4 | 5 | 6
export type Units = "metric" | "imperial"
export type CoachVoice = "neutral" | "casual"
export type WeighInCadence = "few_per_week" | "weekly" | "monthly" | "quarterly"

export type Profile = {
  display_name: string
  sex: Sex
  date_of_birth: string
  height_cm: number
  activity_level: ActivityLevel
  units: Units
  timezone: string
  coach_voice: CoachVoice
  weigh_in_cadence: WeighInCadence
  /** When the walkthrough was finished or skipped; null = show it. */
  tour_done_at: string | null
}

export type MacroTargets = { protein_g: number; fat_g: number; carbs_g: number }

export type Plan = {
  bmr_kcal: number
  maintenance_kcal: number
  target_kcal: number
  delta_kcal: number
  rate_kg_per_week: number
  weeks_to_goal: number | null
  forecast_date: string | null
  macros: MacroTargets
  warnings: string[]
}

export type Goal = {
  id: string
  mode: Mode
  start_weight_kg: number
  goal_weight_kg: number | null
  pace: Pace
  started_on: string
  plan: Plan
}

export type PlanPreviewRequest = {
  sex: Sex
  date_of_birth: string
  height_cm: number
  weight_kg: number
  activity_level: ActivityLevel
  mode: Mode
  goal_weight_kg: number | null
  pace: Pace
}

export type PlanPreviewResponse = { plan: Plan; paces: Record<Pace, Plan> }

export type OnboardingRequest = PlanPreviewRequest & {
  display_name: string
  timezone: string
  units: Units
  /** A preset split key (GET splits); null = their own workouts. */
  split?: string | null
  /** The weekdays they train. */
  gym_days?: Weekday[]
}

export type OnboardingResponse = { profile: Profile; goal: Goal }
export type ProfileResponse = { profile: Profile }
export type GoalResponse = { goal: Goal }
export type NewGoalRequest = { mode: Mode; goal_weight_kg: number | null; pace: Pace }

// ---------------------------------------------------------------- Weight

export type WeighIn = { id: string; date: string; weight_kg: number; note: string | null }
export type WeighInsResponse = { weigh_ins: WeighIn[] }
export type WeighInResponse = { weigh_in: WeighIn }
export type NewWeighInRequest = { date: string; weight_kg: number; note?: string | null }

// ---------------------------------------------------------------- Meal slots

export type MealSchedule = "daily" | "gym_days"
export type MealSlot = {
  id: string
  name: string
  position: number
  schedule: MealSchedule
  /** Local time ("12:30") to be reminded to log it, or null. */
  remind_at: string | null
}
export type MealSlotsResponse = { meal_slots: MealSlot[] }
export type MealSlotResponse = { meal_slot: MealSlot }

// ---------------------------------------------------------------- Food log

export type Macros = { kcal: number; protein_g: number; carbs_g: number; fat_g: number }

export type ItemSource = "official" | "ai" | "user" | "database"

export type EntryItem = Macros & {
  name: string
  grams: number | null
  assumption: string | null
  source: ItemSource
}

export type EntryOrigin = "saved" | "ai" | "manual" | "search" | "barcode" | "restaurant" | "shared"

export type Entry = Macros & {
  id: string
  date: string
  meal_slot_id: string | null
  meal_name: string
  name: string
  origin: EntryOrigin
  saved_meal_id: string | null
  ai_estimate_id: string | null
  items: EntryItem[]
  logged_at: string
  /** Kept meal photos, in order. */
  photos: MealPhoto[]
  /** A food picture key (lib/food-icons.ts), or null. */
  icon: string | null
  /** Friends you sent this meal to, oldest first, with their latest answer. */
  shared_with: EntryShare[]
  /** Set once split: how many people it was divided between (you included). */
  split_ways: number | null
}

export type ShareStatus = "pending" | "accepted" | "declined"
export type EntryShare = Person & { status: ShareStatus }

/** `url` is a signed link that works for about an hour. */
export type MealPhoto = { id: string; url: string; position: number; bytes: number; created_at: string }
export type ListedPhoto = MealPhoto & { entry: { id: string; name: string; date: string } }
export type PhotosResponse = { photos: ListedPhoto[]; stored: number; limit: number | null; enabled: boolean }

export type DayMeal = { meal_slot_id: string | null; name: string; entries: Entry[]; totals: Macros }

export type Day = {
  date: string
  target: Macros
  totals: Macros
  remaining_kcal: number
  meals: DayMeal[]
}

export type DayResponse = { day: Day }
export type EntryDayResponse = { entry: Entry; day: Day; photos_skipped?: number }

export type NewEntryRequest = {
  meal_slot_id?: string | null
  meal_name?: string | null
  name: string
  origin: EntryOrigin
  ai_estimate_id?: string | null
  items?: EntryItem[]
} & Partial<Macros>

export type PatchEntryRequest = {
  name?: string
  meal_slot_id?: string | null
  meal_name?: string | null
  items?: EntryItem[]
}

// ---------------------------------------------------------------- Saved meals

export type SavedMealItem = EntryItem & { id: string; is_addon: boolean }

export type SavedMeal = {
  id: string
  name: string
  default_meal_slot_id: string | null
  items: SavedMealItem[]
  base: Macros
  last_used_at: string | null
  /** A food picture key (lib/food-icons.ts), or null. */
  icon: string | null
} & Community

/** Items sent when creating/updating a saved meal: ids are server-assigned. */
export type SavedMealItemInput = EntryItem & { is_addon: boolean }

export type SavedMealRequest = {
  name: string
  default_meal_slot_id?: string | null
  items: SavedMealItemInput[]
  /** Read when creating only; PUT saved-meals/{id}/visibility changes it. */
  visibility?: Visibility
  /** A food picture key; "none" removes it, left out keeps it. */
  icon?: string
}

export type SavedMealsResponse = { saved_meals: SavedMeal[] }
export type SavedMealResponse = { saved_meal: SavedMeal }

export type LogSavedMealRequest = {
  meal_slot_id?: string | null
  meal_name?: string | null
  addon_ids: string[]
}

// ---------------------------------------------------------------- Foods

export type Food = {
  id: string
  name: string
  brand: string | null
  per_100g: Macros
  serving_name: string | null
  serving_grams: number | null
  source: "custom" | "openfoodfacts" | "chain"
  barcode: string | null
  chain: string | null
}
export type FoodsResponse = { foods: Food[] }
export type FoodResponse = { food: Food }

// ---------------------------------------------------------------- AI estimate

export type EstimateKind = "photo" | "text" | "restaurant"

export type MealEstimateRequest = {
  text?: string
  /** 1–3 photos of the same meal. */
  images?: { media_type: string; data: string }[]
  kind: EstimateKind
  answers?: Record<string, string>
  previous_estimate_id?: string
  /** Refine only: the user's correction, dish name and edited items. */
  correction?: string
  title?: string
  items?: Pick<EntryItem, "name" | "grams" | "kcal" | "protein_g" | "carbs_g" | "fat_g">[]
}

export type EstimateItem = EntryItem & { confidence: number | null }

export type EstimateQuestion = {
  id: string
  text: string
  options: { id: string; label: string }[]
}

/** GET /v1/ai/usage, also returned as `usage` on every estimate. */
export type AiUsage = {
  used_today: number
  limit_today: number
  per_minute: number
  photos_this_month: number
  /** null on Pro (unlimited). */
  photo_limit: number | null
  resets_on: string
}

export type MealEstimateResponse = {
  estimate_id: string
  title: string
  /** The picture the AI chose (lib/food-icons.ts), or null when none fits. */
  icon: string | null
  items: EstimateItem[]
  questions: EstimateQuestion[]
  totals: Macros
  model: string
  usage: AiUsage
}

export type AiUsageResponse = AiUsage

/** `error.code` values on POST /v1/ai/meal-estimate. */
export type EstimateErrorCode =
  | "rate_minute"
  | "rate_day"
  | "photo_limit"
  | "ai_unavailable"
  | "ai_budget"
  | "ai_failed"

// ---------------------------------------------------------------- Gym

export type ExerciseKind = "strength" | "cardio"

export type Exercise = {
  id: string
  name: string
  kind: ExerciseKind
  muscle_group: string | null
  equipment: string | null
  media_url: string | null
  gym_photo_url: string | null
  /** Other names people search by ("stairmaster", "rdl"). */
  aliases: string[]
  /** Search only: the other name that matched the query. */
  matched_alias?: string
}

export type PlannedSet = {
  warmup: boolean
  target_kg: number | null
  target_reps: number | null
  to_failure: boolean
}

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
  /** The version these blocks belong to. */
  version: number
  /** The version sessions start from (differs when viewing an older one). */
  current_version: number
  version_id: string
  blocks: TemplateBlock[]
  updated_at: string
} & Community

export type TemplateVersion = { version: number; version_id: string; created_at: string }

export type TemplateBlockInput = {
  exercise_id: string
  sets: PlannedSet[]
  cardio: Cardio | null
  rest_seconds: number | null
  notes: string | null
}

export type TemplateRequest = { name: string; blocks: TemplateBlockInput[]; visibility?: Visibility }

export type ExercisesResponse = { exercises: Exercise[] }
export type ExerciseResponse = { exercise: Exercise }
export type NewExerciseRequest = {
  name: string
  kind: ExerciseKind
  muscle_group?: string | null
  equipment?: string | null
}
export type TemplatesResponse = { templates: Template[] }
export type TemplateResponse = { template: Template }
export type TemplateDetailResponse = { template: Template; versions: TemplateVersion[] }

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"
export type WeeklyPlan = { days: Record<Weekday, string | null> }

/** A preset week: its workouts cycle over the days you train. */
export type Split = {
  key: string
  name: string
  description: string
  min_days: number
  max_days: number
  default_days: Weekday[]
  workouts: { name: string; exercises: string[] }[]
  /** Indexes into workouts, cycled over the chosen days in week order. */
  rotation: number[]
}
export type SplitsResponse = { splits: Split[] }
export type ApplySplitResponse = { routine: Routine; days: Record<Weekday, string | null> }

export type RoutineDay = { template_id: string; name: string }

/** A named week of the user's own workouts. */
export type Routine = {
  id: string
  name: string
  description: string | null
  /** The split it was made from. */
  preset: string | null
  days: Record<Weekday, RoutineDay | null>
  created_at: string
  updated_at: string
  /** Shop detail only. */
  templates?: Template[]
} & Community
export type RoutinesResponse = { routines: Routine[] }
export type RoutineResponse = { routine: Routine }
export type RoutineRequest = {
  name: string
  description?: string | null
  /** Read when creating only. */
  visibility?: Visibility
  days: Record<Weekday, string | null>
}

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

export type SessionBlock = {
  id: string
  position: number
  exercise: Exercise
  skipped: boolean
  cardio: Cardio | null
  cardio_done: boolean
  sets: SessionSet[]
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
  blocks: SessionBlock[]
}

export type Proposal = { exercise_id: string; exercise_name: string; from_kg: number; to_kg: number }

export type SessionResponse = { session: Session }
export type SessionsResponse = { sessions: Session[] }
export type SessionRecord = { exercise_id: string; exercise_name: string; kg: number; reps: number }
export type FinishSessionResponse = { session: Session; proposals: Proposal[]; records: SessionRecord[] }
export type AddSessionBlockRequest = { exercise_id: string }

// ---------------------------------------------------------------- Progress

export type WeightPoint = { date: string; weight_kg: number }
export type ProgressWeightResponse = {
  weigh_ins: WeighIn[]
  trend: WeightPoint[]
  plan: WeightPoint[]
  goal: Goal | null
}
export type CalorieDay = { date: string; kcal: number; protein_g: number; target_kcal: number; logged: boolean }
export type ProgressCaloriesResponse = { days: CalorieDay[] }
export type ExercisePoint = { date: string; top_kg: number; top_reps: number; e1rm_kg: number }
export type ProgressExerciseResponse = { exercise: Exercise; points: ExercisePoint[] }
export type PersonalRecord = {
  exercise_id: string
  exercise_name: string
  kg: number
  reps: number
  date: string
}
export type ProgressRecordsResponse = { records: PersonalRecord[] }
export type Streak = {
  current: number
  best: number
  active_today: boolean
  last_active: string | null
  /** Oldest first, ending today. */
  last_7: boolean[]
  milestones: { days: number; reached: boolean }[]
  since: string | null
}
export type StreakResponse = { streak: Streak }

// ---------------------------------------------------------------- Billing

export type Billing = {
  plan: "free" | "pro"
  pro_source: "admin" | "referrals" | "subscription" | null
  pro_until: string | null
  photo_estimates: {
    used_this_month: number
    limit_this_month: number | null
    resets_on: string
  }
  referrals: Referrals
  photos_stored: number
  /** null = unlimited (Pro). */
  photos_limit: number | null
}
export type Referrals = { joined: number; needed: number }
export type BillingResponse = { billing: Billing }
export type CheckoutResponse = { url: string }

// ---------------------------------------------------------------- Friends

export type InviteLinkStatus = "open" | "accepted" | "revoked" | "expired"
export type InviteLink = {
  id: string
  /** Open links you can copy again; absent once used, revoked or expired (and on links from before copies were kept). */
  url?: string
  status: InviteLinkStatus
  accepted_by: { id: string; name: string } | null
  counts_as_referral: boolean
  expires_at: string
  created_at: string
}
export type InviteLinkResponse = { invite_link: InviteLink }
export type InviteLinksResponse = { invite_links: InviteLink[]; referrals: Referrals }
export type InvitePreviewResponse = {
  inviter: { name: string; avatar_url: string | null }
  valid: boolean
}
export type AcceptInviteResponse = { friend: Friend; billing: Billing }

export type Sharing = {
  workouts: boolean
  workout_details: boolean
  records: boolean
  weight_trend: boolean
  food_streaks: boolean
  /** Friends see your week: days on target and streak, never calories. */
  weekly_summary: boolean
}
export type SharingResponse = { sharing: Sharing }

export type Friend = {
  id: string
  name: string
  avatar_url: string | null
  since: string
  last_workout_on: string | null
  notify_workouts: boolean
}
export type FriendsResponse = { friends: Friend[] }
export type FriendResponse = { friend: Friend }

/** Someone's week so far (Monday to today, their timezone). No calories. */
export type WeekSummary = {
  week_start: string
  days_logged: number
  days_on_target: number
  days_protein_hit: number
  goal_days: number
  goal_hit: boolean
  streak: number
  active_today: boolean
  /** Finished workouts this week; null when they don't share workouts. */
  workouts: number | null
  /** Monday to Sunday; days after today are empty. */
  days: { date: string; logged: boolean; on_target: boolean; protein_hit: boolean }[]
}
export type FriendWeek = { person: Person; since: string; summary: WeekSummary | null }
export type FriendsWeekResponse = { me: WeekSummary; friends: FriendWeek[] }

/** A meal, template or routine a friend sent, waiting for an answer. */
export type Share = {
  id: string
  kind: "meal" | "template" | "routine"
  from: { id: string; name: string; avatar_url: string | null }
  /** Meal split between this many people (sender included); null = shared whole. */
  split_ways: number | null
  created_at: string
  /** The recipient's part (already divided when split). */
  meal: (Macros & { date: string; name: string; meal_name: string; items: EntryItem[]; icon?: string | null }) | null
  template: { name: string; exercises: string[] } | null
  routine: {
    name: string
    description: string | null
    /** Index into workouts per day. */
    days: Record<Weekday, number | null>
    workouts: { name: string; exercises: string[] }[]
  } | null
}
export type SharesResponse = { shares: Share[] }

/** One line of share history: something a friend sent you, or one send of yours. */
export type ShareHistoryItem = {
  id: string
  kind: Share["kind"]
  name: string
  /** Meals: the part each person got. */
  kcal: number | null
  split_ways: number | null
  created_at: string
  from: Person
  /** Received: you first, then the others on a split meal. Sent: everyone you sent it to. */
  recipients: (Person & { status: ShareStatus; responded_at: string | null })[]
}
export type ShareHistoryResponse = { items: ShareHistoryItem[] }
export type ShareEntryResponse = { entry: Entry; day: Day; shared_with: number }

export type FeedKind = "workout_finished" | "record" | "weight_milestone" | "streak"
export type FeedItem = {
  id: string
  actor: { id: string; name: string; avatar_url: string | null }
  kind: FeedKind
  text: string
  data: Record<string, unknown>
  created_at: string
  cheers: number
  cheered_by_me: boolean
}
export type FeedResponse = { items: FeedItem[] }
export type FeedItemResponse = { item: FeedItem }

// ---------------------------------------------------------------- Push

export type NotificationPrefs = {
  friend_workouts: boolean
  cheers: boolean
  meal_nudges: boolean
  workout_day: boolean
  weigh_in: boolean
  weekly_checkin: boolean
  streak_risk: boolean
  friend_goals: boolean
  quiet_from: string | null
  quiet_to: string | null
}
export type NotificationPrefsResponse = { prefs: NotificationPrefs }
export type VapidKeyResponse = { key: string }
export type PushSubscriptionRequest = {
  endpoint: string
  keys: { p256dh: string; auth: string }
  user_agent?: string
}

// ---------------------------------------------------------------- Shop (community)

export type Visibility = "private" | "friends" | "public"
export type Person = { id: string; name: string; avatar_url: string | null }

/** How an item shows up to other people. */
export type Community = {
  visibility: Visibility
  /** First time it left private. */
  published_at: string | null
  /** People who added it (once each). */
  add_count: number
  /** A moderator removed it from the Shop; only the owner still sees it. */
  hidden: boolean
  /** Added from this person's item. */
  copied_from: Person | null
}
export type VisibilityResponse = { visibility: Visibility; published_at: string | null; hidden: boolean }

export type ShopKind = "routine" | "template" | "meal"
export type ShopSort = "new" | "popular"

export type ShopItem = {
  kind: ShopKind
  id: string
  name: string
  creator: Person
  visibility: Visibility
  add_count: number
  published_at: string | null
  /** The viewer added it before. */
  added: boolean
  mine: boolean
  hidden: boolean
  /** template: exercises; meal: items; routine: its workouts. */
  names: string[]
  macros?: Macros
  days?: Record<Weekday, string | null>
  description?: string | null
}
export type ShopResponse = { items: ShopItem[]; next_offset: number | null }
export type ShopDetailResponse = {
  item: ShopItem
  template?: Template
  saved_meal?: SavedMeal
  routine?: Routine
}
export type ShopAddResponse = { template?: Template; saved_meal?: SavedMeal; routine?: Routine }

export type ReportReason = "spam" | "offensive" | "unsafe" | "other"

export type PersonViewResponse = {
  person: Person
  is_me: boolean
  is_friend: boolean
  friends_since: string | null
  routines: ShopItem[]
  templates: ShopItem[]
  meals: ShopItem[]
  /** Their week, for yourself and for friends who share it. */
  summary: WeekSummary | null
}

export type ReportGroup = {
  kind: ShopKind
  item_id: string
  name: string
  creator: Person
  visibility: Visibility
  hidden: boolean
  count: number
  reasons: Partial<Record<ReportReason, number>>
  notes: string[]
  first_reported_at: string
}
export type ReportsResponse = { reports: ReportGroup[] }
