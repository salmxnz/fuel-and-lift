# API

Base URL `${API_URL}/v1`. JSON in and out, `snake_case` keys, dates as `YYYY-MM-DD`,
timestamps as RFC 3339, ids as UUID strings, weights in kg, energy in kcal, macros in grams.

Errors are always `{"error": {"message": "..."}}` with a meaningful status:
400 bad input, 401 not signed in, 403 not allowed, 404 not found, 409 conflict,
429 rate limited (AI), 502 upstream AI failed.

Authenticated routes need `Authorization: Bearer <access_token>`. Cookie routes
(`refresh`, `logout`) need the `refresh_token` + `csrf_token` cookies **and** an
`X-CSRF-Token` header equal to the csrf cookie (double submit). The browser never
talks to this API directly: the Next.js app is a BFF that keeps every token in
httpOnly cookies (see `docs/auth.md`).

## Auth

### `POST /v1/auth/google`
Sign in with Google. Send **one** of:

```json
{ "code": "4/0Ab...", "code_verifier": "pkce-verifier", "redirect_uri": "https://app.example.com/api/auth/google/callback" }
{ "id_token": "eyJhbGciOi..." }
```
Either form may add `"invite_token": "<token from /join/<token>>"`.

Anyone with a verified Google email can sign up; an unverified email gets
`403 {"error":{"message":"…","code":"email_unverified"}}`. People in
`ADMIN_EMAILS` become `admin` with Pro (no end date). A valid `invite_token`
makes the inviter and the new user friends and counts toward the inviter's
referrals; a used or expired token is ignored and sign-in still succeeds.

`200`:
```json
{
  "access_token": "eyJ...",
  "csrf_token": "9f2c...",
  "user": { "id": "uuid", "email": "you@gmail.com", "name": "Bhavish", "avatar_url": "https://...", "role": "admin" },
  "onboarded": false
}
```
Also sets `refresh_token` (httpOnly) and `csrf_token` cookies.

### `POST /v1/auth/refresh` (cookie route)
Rotates the refresh token. `200 {"access_token","csrf_token"}` + new cookies.

### `POST /v1/auth/logout` (cookie route)
`204`. Revokes the refresh token and clears cookies.

### `GET /v1/auth/me`
`200 {"user": User, "onboarded": bool, "profile": Profile|null}`

## Profile, plan and onboarding

```ts
type Sex = "male" | "female"
type Mode = "gain" | "lose" | "maintain"
type Pace = "slow" | "standard" | "fast"
// activity_level: 1 sedentary, 2 lightly active, 3 somewhat active,
// 4 moderately active, 5 very active, 6 extremely active

type Profile = {
  display_name: string
  sex: Sex
  date_of_birth: string        // YYYY-MM-DD
  height_cm: number
  activity_level: 1|2|3|4|5|6
  units: "metric" | "imperial"
  timezone: string             // IANA, e.g. "Indian/Mauritius"
  coach_voice: "neutral" | "casual"
  weigh_in_cadence: "few_per_week" | "weekly" | "monthly" | "quarterly"
  tour_done_at: string | null  // walkthrough finished or skipped; null = show it (read-only, see tour_done)
}

type Plan = {
  bmr_kcal: number
  maintenance_kcal: number
  target_kcal: number
  delta_kcal: number           // +surplus / -deficit vs maintenance
  rate_kg_per_week: number     // signed
  weeks_to_goal: number | null
  forecast_date: string | null // YYYY-MM-DD
  macros: { protein_g: number, fat_g: number, carbs_g: number }
  warnings: string[]           // e.g. "goal weight is below a BMI of 18.5"
}

type Goal = {
  id: string, mode: Mode, start_weight_kg: number, goal_weight_kg: number | null,
  pace: Pace, started_on: string, plan: Plan
}
```

### `POST /v1/plan/preview`
Pure calculation, no writes. Used live by onboarding's pace step.
```json
{ "sex": "male", "date_of_birth": "2002-05-14", "height_cm": 175, "weight_kg": 53,
  "activity_level": 4, "mode": "gain", "goal_weight_kg": 70, "pace": "standard" }
```
`200 {"plan": Plan, "paces": {"slow": Plan, "standard": Plan, "fast": Plan}}`

### `POST /v1/onboarding`
Body = everything onboarding collected:
```json
{ "display_name": "Bhavish", "sex": "male", "date_of_birth": "2002-05-14", "height_cm": 175,
  "weight_kg": 53, "activity_level": 4, "mode": "gain", "goal_weight_kg": 70, "pace": "standard",
  "timezone": "Indian/Mauritius", "units": "metric",
  "split": "ppl", "gym_days": ["mon", "wed", "fri"] }
```
Creates the profile, the first weigh-in, the goal and the default meal slots
(Breakfast, Lunch, Dinner, Snacks). `201 {"profile": Profile, "goal": Goal}`.
Calling it again returns `409`.

It also fills the Gym tab:
- `split` (a key from `GET /v1/splits`): that split's workouts, a private routine, and the week
  on `gym_days` (the split's `default_days` when empty). An unknown split, or a day count outside
  its `min_days`..`max_days`, is `400` ("Push Pull Legs needs 3 to 6 days").
- `split` null or absent: two starter workouts, Upper-1 and Lower-1, put alternately on
  `gym_days` when given.

`gym_days` are different weekdays, `"mon"` to `"sun"`.

### `GET /v1/profile` → `200 {"profile": Profile}`
### `PATCH /v1/profile` (any subset of Profile fields) → `200 {"profile": Profile}`
Also `{"tour_done": true}` marks the post-onboarding walkthrough done, and
`false` shows it again ("Show me around").
### `GET /v1/goal` → `200 {"goal": Goal}`
### `POST /v1/goal` (`mode`, `goal_weight_kg`, `pace`) → `201 {"goal": Goal}` — starts a new goal from the latest weigh-in.

## Weight

```ts
type WeighIn = { id: string, date: string, weight_kg: number, note: string | null }
```
### `GET /v1/weigh-ins?from=&to=` → `200 {"weigh_ins": WeighIn[]}` (newest first)
### `POST /v1/weigh-ins` `{date, weight_kg, note?}` → `201 {"weigh_in": WeighIn}` (one per day: re-posting a date replaces it)
### `DELETE /v1/weigh-ins/{id}` → `204`

## Meals (the user's meal list)

```ts
type MealSlot = { id: string, name: string, position: number, schedule: "daily" | "gym_days" }
```
### `GET /v1/meal-slots` → `200 {"meal_slots": MealSlot[]}`
### `POST /v1/meal-slots` `{name, schedule?}` → `201 {"meal_slot": MealSlot}`
### `PATCH /v1/meal-slots/{id}` `{name?, schedule?}` → `200 {"meal_slot": MealSlot}`
### `PUT /v1/meal-slots/order` `{"ids": [...]}` → `200 {"meal_slots": MealSlot[]}`
### `DELETE /v1/meal-slots/{id}` → `204` (archived; past entries keep their name)

## Food log

```ts
type Macros = { kcal: number, protein_g: number, carbs_g: number, fat_g: number }

type EntryItem = Macros & {
  name: string
  grams: number | null
  assumption: string | null
  source: "official" | "ai" | "user" | "database"
}

type Entry = Macros & {
  id: string
  date: string
  meal_slot_id: string | null     // null for a one-off meal
  meal_name: string               // slot name, or the one-off name ("Late snack")
  name: string                    // "Usual breakfast", "Fish curry with rice"
  origin: "saved" | "ai" | "manual" | "search" | "barcode" | "restaurant" | "shared"
  saved_meal_id: string | null
  ai_estimate_id: string | null
  items: EntryItem[]
  logged_at: string
  photos: MealPhoto[]             // kept meal photos, in order ([] when none)
}

// url is a signed link to the private bucket, valid for PHOTO_URL_TTL (1h).
type MealPhoto = { id: string, url: string, position: number, bytes: number, created_at: string }

type DayMeal = { meal_slot_id: string | null, name: string, entries: Entry[], totals: Macros }

type Day = {
  date: string
  target: Macros                 // from the active goal
  totals: Macros
  remaining_kcal: number
  meals: DayMeal[]               // the user's daily slots in order (gym_days slots only on gym days), then one-offs
}
```

### `GET /v1/days/{date}` → `200 {"day": Day}`
### `POST /v1/days/{date}/entries`
```json
{ "meal_slot_id": "uuid", "meal_name": null, "name": "Fish curry with rice", "origin": "ai",
  "ai_estimate_id": "uuid", "items": [ { "name": "White rice", "grams": 250, "kcal": 325,
  "protein_g": 6, "carbs_g": 71, "fat_g": 1, "assumption": "normal plate", "source": "ai" } ] }
```
Give `meal_slot_id`, or `meal_name` for a one-off meal. Totals are computed from
`items`; an entry without items may send `kcal`, `protein_g`, `carbs_g`, `fat_g`
directly. `201 {"entry": Entry, "day": Day, "photos_skipped": number}`.
With `ai_estimate_id`, the estimate's photos are kept on the entry while the
user has room (free: `FREE_PHOTOS_STORED`, 20; Pro unlimited); photos that don't
fit are deleted and counted in `photos_skipped`.

### `PATCH /v1/entries/{id}` `{name?, meal_slot_id?, meal_name?, items?}` → `200 {"entry": Entry, "day": Day}`
### `DELETE /v1/entries/{id}` → `200 {"day": Day}` (its photos are deleted too)

## Meal photos

- `GET /v1/photos?before=&limit=` → `200 {"photos": (MealPhoto & {entry: {id, name, date}})[], "stored": number, "limit": number | null, "enabled": boolean}`
  Newest first, 60 per page (`limit` ≤ 120); page with `before` = the last
  photo's `created_at`. `limit` is null on Pro; `enabled` is false when the
  server has no photo storage.
- `DELETE /v1/photos/{id}` → `204` (the meal keeps its numbers)

## Saved meals ("Usual breakfast")

```ts
type SavedMeal = {
  id: string, name: string, default_meal_slot_id: string | null,
  items: (EntryItem & { id: string, is_addon: boolean })[],
  base: Macros,                  // non-add-on items only
  last_used_at: string | null
} & Community                    // see "The Shop"
```
### `GET /v1/saved-meals` → `200 {"saved_meals": SavedMeal[]}` (most recently used first)
### `POST /v1/saved-meals` `{name, default_meal_slot_id?, items, visibility?}` → `201 {"saved_meal": SavedMeal}`
### `PUT /v1/saved-meals/{id}` (same body; `visibility` is ignored) → `200 {"saved_meal": SavedMeal}`
### `PUT /v1/saved-meals/{id}/visibility` `{visibility}` → `200 {visibility, published_at, hidden}`
### `DELETE /v1/saved-meals/{id}` → `204`
### `POST /v1/days/{date}/saved-meals/{id}` `{meal_slot_id?, meal_name?, addon_ids: []}`
Logs the base items plus the chosen add-ons as one entry. `201 {"entry": Entry, "day": Day}`

## Foods

```ts
type Food = {
  id: string, name: string, brand: string | null,
  per_100g: Macros, serving_name: string | null, serving_grams: number | null,
  source: "custom" | "openfoodfacts" | "chain", barcode: string | null, chain: string | null
}
```
### `GET /v1/foods?q=` → `200 {"foods": Food[]}` (your custom foods + shared chain items)
### `POST /v1/foods` → `201 {"food": Food}`
### `GET /v1/foods/barcode/{code}` → `200 {"food": Food}` or `404` (Open Food Facts lookup, cached)

## AI meal estimate

### `POST /v1/ai/meal-estimate`
```json
{ "text": "fish with rice, 1 plate, 2 big bites of fish, some curry",
  "images": [ { "media_type": "image/jpeg", "data": "<base64>" } ],
  "kind": "photo",
  "answers": { "rice_portion": "normal" },
  "previous_estimate_id": "uuid" }
```
`kind` is `photo`, `text` or `restaurant`. `images` is optional: 1–3 photos of
the same meal (the plate, a side, the packaging), each resized to ~768 px on the
phone first, max 2 MB each. A single `"image": {...}` is still accepted. An
estimate counts once toward the free monthly photo estimates however many photos
it has. Send `answers` + `previous_estimate_id` to refine.

A refine (with `previous_estimate_id`) may also send the user's edits, which the
AI treats as fact (all optional, `400` without `previous_estimate_id`):
`"correction": "cooked in oil only, no butter"` (≤300 chars, kept with the text
for later refines), `"title": "Scrambled eggs in oil"` (≤120 chars, used as the
dish name) and `"items": [{name, grams?, kcal, protein_g, carbs_g, fat_g}]`
(≤30, the items as currently edited). The image isn't re-sent.

`200`:
```json
{
  "estimate_id": "uuid",
  "title": "Fish curry with rice",
  "items": [ { "name": "White rice", "grams": 250, "kcal": 325, "protein_g": 6, "carbs_g": 71,
               "fat_g": 1, "assumption": "normal plate", "confidence": 0.7, "source": "ai" } ],
  "questions": [ { "id": "rice_portion", "text": "How much rice?",
                   "options": [ { "id": "small", "label": "Small" }, { "id": "normal", "label": "Normal plate" } ] } ],
  "totals": { "kcal": 485, "protein_g": 22, "carbs_g": 75, "fat_g": 9 },
  "model": "google/gemini-2.5-flash",
  "usage": { "used_today": 3, "limit_today": 60, "per_minute": 6, "photos_this_month": 4, "photo_limit": 10, "resets_on": "2026-11-01" }
}
```
`429` when over the per-minute or per-day limit, `503` when AI is not configured,
`502` when every provider failed.

With photo storage on (R2), each photo of a photo estimate is kept as
*pending*; logging the meal with `ai_estimate_id` (the estimate or one that
refined it) keeps it on the entry. Pending photos never logged are deleted
after a day.

### `GET /v1/ai/usage`
`200 {"used_today": 3, "limit_today": 60, "per_minute": 6, "photos_this_month": 4, "photo_limit": 10 | null, "resets_on": "2026-11-01"}`
(`photo_limit` is `null` on Pro). The same object is returned as `usage` on every estimate.

Error codes on `POST /v1/ai/meal-estimate`: `rate_minute` / `rate_day` (429),
`photo_limit` (402), `ai_unavailable` / `ai_budget` (503), `ai_failed` (502).

## Gym

```ts
type Exercise = { id: string, name: string, kind: "strength" | "cardio",
                  muscle_group: string | null, equipment: string | null,
                  media_url: string | null, gym_photo_url: string | null,
                  aliases: string[],              // other names: "stairmaster", "rdl"
                  matched_alias?: string }        // search only: the alias that matched

type PlannedSet = { warmup: boolean, target_kg: number | null,
                    target_reps: number | null, to_failure: boolean }

type TemplateBlock = {
  id: string, position: number, exercise: Exercise,
  sets: PlannedSet[],                       // strength
  cardio: { minutes: number, incline: number | null, speed: number | null } | null,
  rest_seconds: number | null, notes: string | null
}

type Template = { id: string, name: string, version: number, version_id: string,
                  current_version: number,  // = version unless viewing an older one
                  blocks: TemplateBlock[], updated_at: string } & Community  // see "The Shop"
```
### `GET /v1/exercises?q=` → `200 {"exercises": Exercise[]}`
Ranked search over the shared library and your own exercises: every word must
match the name, an alias, the muscle group or the equipment, in any order,
with a small typo allowed ("raise calf", "calf rasie", "stair master", "rdl").
Best 50 results; an empty `q` returns everything by name.
### `POST /v1/exercises` `{name, kind, muscle_group?, equipment?}` → `201 {"exercise": Exercise}`
### `GET /v1/templates` → `200 {"templates": Template[]}`
### `POST /v1/templates` `{name, blocks: [{exercise_id, sets, cardio, rest_seconds, notes}], visibility?}` → `201 {"template": Template}`
### `GET /v1/templates/{id}` → `200 {"template": Template, "versions": [{version, version_id, created_at}]}`
### `PUT /v1/templates/{id}` (same body as POST) → `200 {"template": Template}` — saves a **new version**
### `DELETE /v1/templates/{id}` → `204` (archived; history keeps it)
### `GET /v1/templates/{id}/versions/{version}` → `200 {"template": Template}`
That version's blocks; `template.version` is the one asked for and
`template.current_version` the one sessions start from. `404` if it doesn't exist.
### `POST /v1/templates/{id}/current` `{version}` → `200 {"template": Template}`
Makes an existing version current (nothing is copied). The next `PUT` saves as
the highest version + 1.
### `PUT /v1/templates/{id}/visibility` `{visibility}` → `200 {visibility, published_at, hidden}`
Doesn't make a new version.

### Weekly plan
`GET /v1/weekly-plan` → `200 {"days": {"mon": "template-uuid" | null, "tue": ..., "sun": ...}}`
(`WeeklyPlanDays` below means that `days` object.)
`PUT /v1/weekly-plan` (same shape) → `200`

### Splits and routines
A **split** is a preset week (Push Pull Legs, Bro Split…). Its workouts are
cycled over the days you train: PPL on Mon/Wed/Fri is Push, Pull, Legs; on six
days it goes round twice. A **routine** is your own named week of workouts. It
points at your templates (editing a workout changes the routine) and becomes
your week when you apply it.

```ts
type Split = {
  key: string, name: string, description: string,
  min_days: number, max_days: number, default_days: Weekday[],   // Weekday = "mon" … "sun"
  workouts: { name: string, exercises: string[] }[],
  rotation: number[]          // indexes into workouts, cycled over the chosen days in week order
}

type Routine = {
  id: string, name: string, description: string | null,
  preset: string | null,      // the split it was made from
  days: Record<Weekday, { template_id: string, name: string } | null>,
  created_at: string, updated_at: string,
  templates?: Template[]      // Shop detail only
} & Community
```
- `GET /v1/splits` → `200 {"splits": Split[]}`
- `POST /v1/splits/{key}/apply` `{days?: Weekday[], apply_to_week?: bool = true}` → `201 {"routine": Routine, "days": WeeklyPlanDays}`
  New workouts (only those the days use) and a routine. With `apply_to_week` it replaces your week.
  Each apply makes new workouts. `400` when the day count doesn't fit the split.
- `GET /v1/routines` → `200 {"routines": Routine[]}` (most recently changed first)
- `POST /v1/routines` `{name, description?, visibility?, days: {mon: template_id | null, …}}` → `201 {"routine": Routine}`
  Name up to 40, description up to 200. A workout that isn't yours is `404`.
- `GET /v1/routines/{id}` → `200 {"routine": Routine}`
- `PUT /v1/routines/{id}` (same body; `visibility` ignored) → `200 {"routine": Routine}`
- `DELETE /v1/routines/{id}` → `204` (its workouts and your week stay)
- `POST /v1/routines/{id}/apply` → `200 {"days": WeeklyPlanDays}`. Replaces your week; `400` if it has no training days.
- `POST /v1/routines/{id}/share` `{friend_ids}` → `201 {"shared_with": number}` (see Sharing)
- `PUT /v1/routines/{id}/visibility` `{visibility}` → `200 {visibility, published_at, hidden}`

Deleting a workout also takes it off your routines.

### Sessions

```ts
type SessionSet = { id: string, position: number, warmup: boolean,
                    target_kg: number | null, target_reps: number | null, to_failure: boolean,
                    actual_kg: number | null, actual_reps: number | null, done: boolean }

type SessionBlock = { id: string, position: number, exercise: Exercise, skipped: boolean,
                      cardio: { minutes: number, incline: number | null, speed: number | null } | null,
                      cardio_done: boolean, sets: SessionSet[] }

type Session = { id: string, date: string, template_id: string | null, template_name: string | null,
                 template_version: number | null, status: "active" | "finished",
                 started_at: string, finished_at: string | null, blocks: SessionBlock[] }

type Proposal = { exercise_id: string, exercise_name: string, from_kg: number, to_kg: number }
```
- `POST /v1/sessions` `{date, template_id?}` → `201 {"session": Session}` (a copy of the template's current version)
- `GET /v1/sessions?from=&to=` → `200 {"sessions": Session[]}`
- `GET /v1/sessions/{id}` → `200 {"session": Session}`
- `POST /v1/sessions/{id}/blocks` `{exercise_id}` → `201 {"session": Session}` (an extra exercise today only)
- `PATCH /v1/sessions/{id}/blocks/{block_id}` `{skipped?, cardio_done?}` → `200 {"session": Session}`
- `POST /v1/sessions/{id}/blocks/{block_id}/sets` `{warmup?, target_kg?, target_reps?, to_failure?}` → `201 {"session": Session}` (a third set today)
- `PATCH /v1/sessions/{id}/sets/{set_id}` `{actual_kg?, actual_reps?, done?}` → `200 {"session": Session}`
- `POST /v1/sessions/{id}/accept-all` → marks every unskipped set done at its targets → `200 {"session": Session}`
- `POST /v1/sessions/{id}/finish` → `200 {"session": Session, "proposals": Proposal[], "records": Record[]}`
  (`Record = {exercise_id, exercise_name, kg, reps}`; the first finish posts to the feed and pushes friends, finishing again only recomputes)
  A proposal appears when every done working set of an exercise beat the template's target weight.
- `POST /v1/sessions/{id}/apply` `{"exercise_ids": [...]}` → `200 {"template": Template}` (new version)

## Progress

- `GET /v1/progress/weight?from=&to=` → `{"weigh_ins": WeighIn[], "trend": [{date, weight_kg}], "plan": [{date, weight_kg}], "goal": Goal|null}`
- `GET /v1/progress/calories?from=&to=` → `{"days": [{date, kcal, protein_g, target_kcal, logged}]}` (`logged`: at least one entry that day)
- `GET /v1/progress/exercises/{exercise_id}` → `{"exercise": Exercise, "points": [{date, top_kg, top_reps, e1rm_kg}]}`
- `GET /v1/progress/records` → `{"records": [{exercise_id, exercise_name, kg, reps, date}]}`
- `GET /v1/progress/streak` → `{"streak": {current, best, active_today, last_active, last_7: bool[7], milestones: [{days, reached}], since}}`
  One combined streak: a day counts when a meal was logged or a workout
  finished (user's time zone). Today without activity yet doesn't break it.
  `last_7` is oldest first, ending today. Milestones: 3, 7, 14, 30, 60, 100, 365.
  Reaching one (by logging today or finishing a workout) posts a `streak`
  activity once per streak, `text` "is on a 7-day streak", `data` `{days}`,
  and pushes to friends who get workout pushes, when `food_streaks` is on.

## Plan (free / Pro)

One paid tier, **Pro**: unlimited AI. **Free**: 10 photo estimates per calendar
month (in the user's time zone); text and restaurant estimates are not counted
against the monthly allowance but share the fair-use rate limit.

Pro comes from one of three sources: `admin` (set by an admin), `referrals`
(**8 friends joined through your links: Pro forever for you**) or `subscription`
(paid; checkout not wired yet). Pro cannot be gifted. A referral counts once the
friend has finished onboarding, and each person can only ever count for one
inviter.

```ts
type Billing = {
  plan: "free" | "pro"
  pro_source: "admin" | "referrals" | "subscription" | null
  pro_until: string | null                 // null = forever
  photo_estimates: { used_this_month: number, limit_this_month: number | null, resets_on: string } // null = unlimited
  referrals: { joined: number, needed: number }  // needed = 8
  photos_stored: number                    // meal photos kept
  photos_limit: number | null              // 20 on free, null = unlimited
}
```
- `GET /v1/billing` → `200 {"billing": Billing}`
- `POST /v1/billing/checkout` → `501` until a payment provider is configured (returns `{url}` later)

When a free user is over the monthly photo allowance, `POST /v1/ai/meal-estimate`
with an image returns `402 {"error": {"message": "...", "code": "photo_limit"}}`
and the app opens the paywall.

## Friends

### Invite links ("add friend via link")
A link is single use and expires after 14 days. Opening it signs the friend in
(new users are let in by the link, so links double as invites) and makes the two
of you friends. A **new** user who joins through your link and finishes
onboarding counts towards your 8 referrals.

```ts
type InviteLink = { id: string, url: string, status: "open" | "accepted" | "revoked" | "expired",
                    accepted_by: { id: string, name: string } | null, counts_as_referral: boolean,
                    expires_at: string, created_at: string }
```
- `POST /v1/invite-links` `{}` → `201 {"invite_link": InviteLink}` (`url` = `${APP_URL}/join/<token>`; the raw token is returned only here)
- `GET /v1/invite-links` → `200 {"invite_links": InviteLink[], "referrals": {joined, needed}}`
- `DELETE /v1/invite-links/{id}` → `204` (revoke)
- `GET /v1/invite-links/preview/{token}` (**no auth**) → `200 {"inviter": {"name", "avatar_url"}, "valid": bool}`
- `POST /v1/invite-links/accept` `{token}` (signed-in user) → `200 {"friend": Friend, "billing": Billing}`
- New users: pass `invite_token` in `POST /v1/auth/google` to become friends with the inviter and count as their referral.

### Friends and sharing
```ts
type Sharing = {
  workouts: boolean          // "Bhavish worked out today" + the template name
  workout_details: boolean   // exercises, sets and weights
  records: boolean           // new personal records
  weight_trend: boolean      // direction and milestones only, never the number
  food_streaks: boolean      // streak milestones: "is on a 7-day streak"
}
type Friend = { id: string, name: string, avatar_url: string | null, since: string,
                last_workout_on: string | null, notify_workouts: boolean }
type FeedItem = { id: string, actor: { id: string, name: string, avatar_url: string | null },
                  kind: "workout_finished" | "record" | "weight_milestone" | "streak",
                  text: string,              // "Upper-1 done: 4 exercises, 38 min"
                  data: Record<string, unknown>,
                  created_at: string, cheers: number, cheered_by_me: boolean }
```
- `GET /v1/friends` → `200 {"friends": Friend[]}`
- `DELETE /v1/friends/{user_id}` → `204`
- `PATCH /v1/friends/{user_id}` `{notify_workouts}` → `200 {"friend": Friend}` (push me when this friend finishes a workout)
- `GET /v1/sharing` / `PUT /v1/sharing` → `{"sharing": Sharing}` (what all my friends can see; defaults: workouts, records and streaks on, the rest off)
- `GET /v1/feed?before=` → `200 {"items": FeedItem[]}` (friends' activity, newest first, 30 per page)
- `POST /v1/feed/{id}/cheer` / `DELETE /v1/feed/{id}/cheer` → `200 {"item": FeedItem}` (a cheer pushes the actor)

Activity is written when it happens (finishing a session, a new record, a weigh-in
milestone) and only if the actor's sharing allows that kind. Turning a sharing
switch off hides that kind from the feed immediately, including older items.

### Sharing a meal, a template or a routine with friends
Send a logged meal or a gym template to friends; it waits for them until
they add it or say no thanks. What's sent is a copy taken at that moment:
later edits on either side stay their own. Shares from someone who is no
longer a friend disappear.

```ts
type Share = {
  id: string, kind: "meal" | "template" | "routine",
  from: { id: string, name: string, avatar_url: string | null },
  split_ways: number | null,     // meal split between this many people (you included); null = shared whole
  created_at: string,
  meal: (Macros & { date: string, name: string, meal_name: string, items: EntryItem[] }) | null,  // the friend's part
  template: { name: string, exercises: string[] } | null,
  routine: { name: string, description: string | null,
             days: Record<Weekday, number | null>,                // index into workouts
             workouts: { name: string, exercises: string[] }[] } | null
}
```
- `POST /v1/entries/{id}/share` `{friend_ids: [...], split: bool}` → `201 {"entry": Entry, "day": Day, "shared_with": number}`
  - `split: true` — you ate it together: the meal is divided equally between
    you and every friend picked, your own entry shrinks to your part now
    (items, grams and macros scaled) and each friend is offered the same part.
    A meal can only be split once: `409` code `already_split`.
  - `split: false` — you each had the same: every friend is offered the whole meal.
  - 1 to 10 friends; anyone who isn't a friend is `403` code `not_friends`.
    Sending the same meal to someone it's still waiting for does nothing.
- `POST /v1/templates/{id}/share` `{friend_ids: [...]}` → `201 {"shared_with": number}`
  (the current version, with your sets and target weights)
- `POST /v1/routines/{id}/share` `{friend_ids: [...]}` → `201 {"shared_with": number}`
  (a copy of each of its workouts)
- `GET /v1/shares?kind=meal|template|routine` → `200 {"shares": Share[]}` (waiting for you, newest first, 20 at most; no `kind` = all)
- `POST /v1/shares/{id}/accept`
  - meal: `{meal_slot_id | meal_name, date?}` → `201 {"entry": Entry, "day": Day}`. Logged with
    `origin: "shared"` on `date`, which defaults to the day it was eaten and is
    never later than your today.
  - template: `{}` → `201 {"template": Template}`. A copy in your templates;
    library exercises are reused, the sender's own exercises are matched by
    name in yours or created. If you already have a template with that name,
    the copy gets the sender's first name: "Lower-1 (Sam)".
  - routine: `{}` → `201 {"routine": Routine}`. Copies of its workouts (as for a
    template) and a routine using them. Your week isn't changed until you apply it.
- `DELETE /v1/shares/{id}` → `204` (no thanks)

The friend gets a push ("Bhavish split Pizza with you", "Bhavish shared a
workout with you") that opens Today or Gym, where waiting shares are shown.

## The Shop (community)
Workouts (templates), saved meals and routines each have a visibility:
**private** (the default), **friends** (your friends see it on your profile and
in their Shop), or **public** (everyone, in the Shop). Making a routine visible
shows its workouts too, whatever their own setting. Other people see the
current version of what you share. Adding something makes a private copy in
your account that credits you.

```ts
type Visibility = "private" | "friends" | "public"
type Person = { id: string, name: string, avatar_url: string | null }

type Community = {
  visibility: Visibility,
  published_at: string | null,  // first time it left private ("newest" sorts on this; switching back doesn't move it)
  add_count: number,            // people who added it (once each)
  hidden: boolean,              // a moderator removed it from the Shop; only you still see it
  copied_from: Person | null    // you added it from this person
}

type ShopKind = "routine" | "template" | "meal"

type ShopItem = {
  kind: ShopKind, id: string, name: string, creator: Person,
  visibility: Visibility, add_count: number, published_at: string | null,
  added: boolean,               // you've added it before
  mine: boolean, hidden: boolean,
  names: string[],              // template: exercises; meal: items (no add-ons); routine: its workouts
  macros?: Macros,              // meal
  days?: Record<Weekday, string | null>,   // routine: workout name per day
  description?: string | null   // routine
}
```
- `GET /v1/shop?kind=routine|template|meal&sort=new|popular&q=&offset=` → `200 {"items": ShopItem[], "next_offset": number | null}`
  Everything public plus your friends' friends-only items; never your own, nor hidden items.
  `q` matches anywhere in the name (case-insensitive). 30 per page, `offset` up to 300.
  `kind` is required.
- `GET /v1/shop/{kind}/{id}` → `200 {item: ShopItem, template?: Template, saved_meal?: SavedMeal, routine?: Routine}`
  The item in full (a routine with its `templates`), creator's custom exercises included.
  Yours, or shared with you; `404` otherwise. Admins can open anything, hidden items included.
- `POST /v1/shop/{kind}/{id}/add` → `201 {"template": Template} | {"saved_meal": SavedMeal} | {"routine": Routine}`
  A private copy with `copied_from` set. A routine comes with copies of its workouts; your
  week isn't changed. Your own item is `409` code `own_item`.
- `POST /v1/shop/{kind}/{id}/report` `{reason: "spam" | "offensive" | "unsafe" | "other", note?}` → `201 {}`
  Note up to 300 characters. Reporting again while it's open does nothing. `404` for your
  own items or ones you can't see.

### People
`GET /v1/people/{id}` → `200 PersonView`
```ts
type PersonView = {
  person: Person, is_me: boolean, is_friend: boolean,
  friends_since: string | null,
  routines: ShopItem[], templates: ShopItem[], meals: ShopItem[]   // what they share with you, newest first
}
```
On your own id, it shows what you share (friends + public). `404` unless it's you,
a friend, or someone with something public.

### Moderation (admins only; others get `403`)
```ts
type ReportGroup = {
  kind: ShopKind, item_id: string, name: string, creator: Person,
  visibility: Visibility, hidden: boolean,
  count: number, reasons: Record<string, number>,
  notes: string[],              // newest 5
  first_reported_at: string
}
```
- `GET /v1/admin/reports` → `200 {"reports": ReportGroup[]}` (open reports, most reported first)
- `POST /v1/admin/shop/{kind}/{id}/hide` → `200 {"hidden": true}`. Out of the Shop, profiles and adds
  for everyone but the owner (who gets a push). Closes its open reports.
- `DELETE /v1/admin/shop/{kind}/{id}/hide` → `200 {"hidden": false}`
- `POST /v1/admin/shop/{kind}/{id}/dismiss` → `204` (closes the reports, nothing hidden)

## Notifications (Web Push)

```ts
type NotificationPrefs = {
  friend_workouts: boolean, cheers: boolean, meal_nudges: boolean,
  workout_day: boolean, weigh_in: boolean, weekly_checkin: boolean,
  quiet_from: string | null, quiet_to: string | null   // "22:00", "07:00"
}
```
- `GET /v1/push/vapid-public-key` → `200 {"key": "B..."}` (no auth)
- `POST /v1/push/subscriptions` `{endpoint, keys: {p256dh, auth}, user_agent?}` → `201`
- `DELETE /v1/push/subscriptions` `{endpoint}` → `204`
- `GET /v1/notification-prefs` / `PUT /v1/notification-prefs` → `{"prefs": NotificationPrefs}`

## System

- `GET /health` → `{"status":"ok"}` (checks the database)
