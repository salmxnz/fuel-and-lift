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
  "timezone": "Indian/Mauritius", "units": "metric" }
```
Creates the profile, the first weigh-in, the goal and the default meal slots
(Breakfast, Lunch, Dinner, Snacks). `201 {"profile": Profile, "goal": Goal}`.
Calling it again returns `409`.

### `GET /v1/profile` → `200 {"profile": Profile}`
### `PATCH /v1/profile` (any subset of Profile fields) → `200 {"profile": Profile}`
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
  origin: "saved" | "ai" | "manual" | "search" | "barcode" | "restaurant"
  saved_meal_id: string | null
  ai_estimate_id: string | null
  items: EntryItem[]
  logged_at: string
}

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
directly. `201 {"entry": Entry, "day": Day}`.

### `PATCH /v1/entries/{id}` `{name?, meal_slot_id?, meal_name?, items?}` → `200 {"entry": Entry, "day": Day}`
### `DELETE /v1/entries/{id}` → `200 {"day": Day}`

## Saved meals ("Usual breakfast")

```ts
type SavedMeal = {
  id: string, name: string, default_meal_slot_id: string | null,
  items: (EntryItem & { id: string, is_addon: boolean })[],
  base: Macros,                  // non-add-on items only
  last_used_at: string | null
}
```
### `GET /v1/saved-meals` → `200 {"saved_meals": SavedMeal[]}` (most recently used first)
### `POST /v1/saved-meals` `{name, default_meal_slot_id?, items}` → `201 {"saved_meal": SavedMeal}`
### `PUT /v1/saved-meals/{id}` (same body) → `200 {"saved_meal": SavedMeal}`
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
  "image": { "media_type": "image/jpeg", "data": "<base64>" },
  "kind": "photo",
  "answers": { "rice_portion": "normal" },
  "previous_estimate_id": "uuid" }
```
`kind` is `photo`, `text` or `restaurant`. `image` is optional (resize to ~768 px
on the phone first; max 2 MB). Send `answers` + `previous_estimate_id` to refine.

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
                  blocks: TemplateBlock[], updated_at: string }
```
### `GET /v1/exercises?q=` → `200 {"exercises": Exercise[]}`
Ranked search over the shared library and your own exercises: every word must
match the name, an alias, the muscle group or the equipment, in any order,
with a small typo allowed ("raise calf", "calf rasie", "stair master", "rdl").
Best 50 results; an empty `q` returns everything by name.
### `POST /v1/exercises` `{name, kind, muscle_group?, equipment?}` → `201 {"exercise": Exercise}`
### `GET /v1/templates` → `200 {"templates": Template[]}`
### `POST /v1/templates` `{name, blocks: [{exercise_id, sets, cardio, rest_seconds, notes}]}` → `201 {"template": Template}`
### `GET /v1/templates/{id}` → `200 {"template": Template, "versions": [{version, version_id, created_at}]}`
### `PUT /v1/templates/{id}` (same body as POST) → `200 {"template": Template}` — saves a **new version**
### `DELETE /v1/templates/{id}` → `204` (archived; history keeps it)
### `GET /v1/templates/{id}/versions/{version}` → `200 {"template": Template}`
That version's blocks; `template.version` is the one asked for and
`template.current_version` the one sessions start from. `404` if it doesn't exist.
### `POST /v1/templates/{id}/current` `{version}` → `200 {"template": Template}`
Makes an existing version current (nothing is copied). The next `PUT` saves as
the highest version + 1.

### Weekly plan
`GET /v1/weekly-plan` → `200 {"days": {"mon": "template-uuid" | null, "tue": ..., "sun": ...}}`
`PUT /v1/weekly-plan` (same shape) → `200`

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
- `GET /v1/progress/calories?from=&to=` → `{"days": [{date, kcal, protein_g, target_kcal}]}`
- `GET /v1/progress/exercises/{exercise_id}` → `{"exercise": Exercise, "points": [{date, top_kg, top_reps, e1rm_kg}]}`
- `GET /v1/progress/records` → `{"records": [{exercise_id, exercise_name, kg, reps, date}]}`

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
  food_streaks: boolean      // "hit protein 5 days in a row"
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
- `GET /v1/sharing` / `PUT /v1/sharing` → `{"sharing": Sharing}` (what all my friends can see; defaults: workouts and records on, the rest off)
- `GET /v1/feed?before=` → `200 {"items": FeedItem[]}` (friends' activity, newest first, 30 per page)
- `POST /v1/feed/{id}/cheer` / `DELETE /v1/feed/{id}/cheer` → `200 {"item": FeedItem}` (a cheer pushes the actor)

Activity is written when it happens (finishing a session, a new record, a weigh-in
milestone) and only if the actor's sharing allows that kind. Turning a sharing
switch off hides that kind from the feed immediately, including older items.

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
