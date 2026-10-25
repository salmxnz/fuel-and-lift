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

The BFFs (web and admin) forward the visitor's address as `X-Client-IP`; the API
uses it for refresh tokens and the audit log. It's only trustworthy while the
API can't be reached except through a BFF, since anyone calling it directly can
set the header.

Every request (but `GET /health` and reads of the logs) is recorded in the audit log (see "Admin:
audit log"): who, what route, status, time taken and error text, never bodies.

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
A suspended account gets `403 {"error":{"message":"…","code":"suspended"}}`.

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
`401` when the token is used, revoked or expired; `401` with `code: "suspended"`
when the account is suspended.

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

### Profile photo
- `POST /v1/profile/avatar` `{media_type, data}` → `200 {"user": User}`. `data` is base64 (no
  `data:` prefix), at most 2 MB, JPEG, PNG or WebP. The type is checked from the bytes, not
  `media_type`. The app sends a 512 px square JPEG. `user.avatar_url` becomes
  `${APP_URL}/avatars/<user id>?v=<unix time>`, so it changes with every new photo.
- `DELETE /v1/profile/avatar` → `200 {"user": User}`, back to the Google picture (or `null`).
- `GET /v1/avatars/{user_id}` (**no auth**) → the image bytes, with `Cache-Control: public,
  max-age=31536000, immutable`, or `404`. The PWA serves it at `/avatars/{user_id}`.

Signing in with Google again updates the Google picture but never replaces an uploaded photo.
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
type MealSlot = {
  id: string, name: string, position: number, schedule: "daily" | "gym_days",
  remind_at: string | null   // local "12:30": push a reminder if nothing's logged in it by then
}
```
### `GET /v1/meal-slots` → `200 {"meal_slots": MealSlot[]}`
### `POST /v1/meal-slots` `{name, schedule?, remind_at?}` → `201 {"meal_slot": MealSlot}`
### `PATCH /v1/meal-slots/{id}` `{name?, schedule?, remind_at?}` → `200 {"meal_slot": MealSlot}` (`remind_at: null` clears it; leaving it out keeps it)
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
  icon: FoodIcon | null           // its picture; null = none (the app may guess one from the name)
  category: MealCategory | null   // copied from the saved meal it was logged from, or when logged again
  // Friends you sent this meal to, oldest first, with each one's latest
  // answer ([] when never shared, and always [] on a meal a friend sent you).
  shared_with: (Person & { status: "pending" | "accepted" | "declined" })[]
  split_ways: number | null       // set once split: people it was divided between, you included
}

// A food picture: one of a fixed set of keys (api/internal/foodicon), never
// renamed. The web app draws public/food/<key>.png.
type FoodIcon =
  | "pizza" | "burger" | "fries" | "hot_dog" | "taco" | "sandwich" | "rice_bowl"
  | "chicken" | "meat" | "canned_fish" | "fried_egg"
  | "bread" | "toast" | "cheese" | "milk" | "honey"
  | "apple" | "banana" | "watermelon" | "bell_pepper" | "chili" | "cabbage" | "mushroom"
  | "chips" | "popcorn" | "donut" | "cupcake" | "pie" | "sweet" | "lollipop" | "candy_cane"
  | "coffee" | "soda" | "beer" | "salt"

// What kind of meal it was. Labels: Home-cooked, Takeaway, Eating out, Snack,
// Sweet treat, Drink, High protein.
type MealCategory = "home" | "takeaway" | "eating_out" | "snack" | "sweet" | "drink" | "protein"

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
directly. Optional `icon`: a `FoodIcon` (`"none"` or left out = no picture; an
unknown key is `400`). Optional `category`: a `MealCategory` (`"none"` or left
out = none; anything else is `400`). `201 {"entry": Entry, "day": Day, "photos_skipped": number}`.
With `ai_estimate_id`, the estimate's photos are kept on the entry while the
user has room (free: `FREE_PHOTOS_STORED`, 20; Pro unlimited); photos that don't
fit are deleted and counted in `photos_skipped`.

### `PATCH /v1/entries/{id}` `{name?, meal_slot_id?, meal_name?, items?, icon?, category?}` → `200 {"entry": Entry, "day": Day}`
`icon`: a `FoodIcon`, or `"none"` to remove it; left out keeps it. `category`
works the same way with a `MealCategory`.
### `POST /v1/entries/{id}/save` `{name?, category?}` → `201 {"saved_meal": SavedMeal, "entry": Entry, "day": Day}`
Saves one of your entries, from any day, as a saved meal: its items (an entry
logged as plain totals becomes one item), picture, meal and category; `name` and
`category` override the entry's. Visibility is the user's default, as for
`POST /v1/saved-meals`. The entry's `saved_meal_id` then points at it, and it
takes the category if it had none. `day` is the entry's day. Someone else's
entry is `404`.
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
  last_used_at: string | null,
  icon: FoodIcon | null,         // copied to entries logged from it, and to Shop copies
  category: MealCategory | null  // the same
} & Community                    // see "The Shop"
```
### `GET /v1/saved-meals` → `200 {"saved_meals": SavedMeal[]}` (most recently used first)
### `POST /v1/saved-meals` `{name, default_meal_slot_id?, items, visibility?, icon?, category?}` → `201 {"saved_meal": SavedMeal}`
### `PUT /v1/saved-meals/{id}` (same body; `visibility` is ignored; `icon` and `category` left out keep theirs, `"none"` removes them) → `200 {"saved_meal": SavedMeal}`
### `PUT /v1/saved-meals/{id}/visibility` `{visibility}` → `200 {visibility, published_at, hidden}`
### `DELETE /v1/saved-meals/{id}` → `204`
### `POST /v1/days/{date}/saved-meals/{id}` `{meal_slot_id?, meal_name?, addon_ids: []}`
Logs the base items plus the chosen add-ons as one entry. `201 {"entry": Entry, "day": Day}`

## Suggestions
`GET /v1/suggestions?date=&meal_slot_id=` → `200`
```ts
{ again: Entry[],            // what you had in this meal the last time (within 2 weeks), usually yesterday
  again_date: string | null,
  usual: Entry[],            // logged twice or more here in 30 days, most often first (not repeating `again`)
  gap: { nutrient: "protein" | "kcal", left: number,   // grams or kcal still to go today
         picks: Entry[] } | null,   // your own past meals rich in it that fit what's left (protein only)
  friends: FriendMeal[] }    // friends who share meals: what they logged that day, newest first (never calories)
```
`meal_slot_id` is optional; without it `again` and `usual` are empty. `gap` is null when you're
within 120 kcal of your target or over.

`POST /v1/entries/{id}/again` `{date?, meal_slot_id?, meal_name?}` → `201 {"entry": Entry, "day": Day}`:
logs one of your entries again (items, macros, picture, category and origin; `shared` becomes `manual`).
`date` defaults to today; the meal defaults to the original's.

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
  "icon": "rice_bowl",
  "items": [ { "name": "White rice", "grams": 250, "kcal": 325, "protein_g": 6, "carbs_g": 71,
               "fat_g": 1, "assumption": "normal plate", "confidence": 0.7, "source": "ai" } ],
  "questions": [ { "id": "rice_portion", "text": "How much rice?",
                   "options": [ { "id": "small", "label": "Small" }, { "id": "normal", "label": "Normal plate" } ] } ],
  "totals": { "kcal": 485, "protein_g": 22, "carbs_g": 75, "fat_g": 9 },
  "model": "google/gemini-2.5-flash",
  "usage": { "used_today": 3, "limit_today": 60, "per_minute": 6, "photos_this_month": 4, "photo_limit": 10, "resets_on": "2026-11-01" }
}
```
`icon` is the `FoodIcon` the AI picked for the whole meal, or `null` when none
fits; send it (or the user's choice) as `icon` when logging.
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

## AI for the gym

Both count toward the per-minute and per-day AI limits and the monthly budget
(same error codes as meal estimates, never `photo_limit`): gym photos are
**not** photo estimates and don't use up the free 10 a month.

### `POST /v1/ai/exercise` `{text?, images?}`
What exercise a photo of a machine (up to 2 photos, e.g. the machine and its
placard) or a description is, and what weight is set on it.

```ts
type ExerciseOption = {
  library_name: string,          // "" when nothing in the library is the same exercise
  name: string, kind: "strength" | "cardio",
  muscle_group: string, muscles: Muscle[], equipment: string,   // "" when unsure
  picture_like: string,          // library exercise whose photo looks closest
  cue: string,                   // "Rear delts, strict, easy to load"
  match: Exercise | null,        // the library (or your own) exercise to use
  picture_from: string | null,   // no match: send as POST /v1/exercises picture_from
  media_url: string | null       // the picture either way
}
```
`200 {found, options: ExerciseOption[], weight_kg: number | null,
weight_source: "pin" | "plates" | "dumbbell" | "text" | "none", weight_note,
sets, reps: number | null, note, confidence, model, usage}`.
A photo or a specific description gives one option; something vague ("rear
delt", "upper chest") gives up to three variations, best first. `found: false`
(and no options) when the photo shows no gym equipment. `weight_kg` is read off
the pin, the plates loaded or a dumbbell, or taken from the text; `sets` is 3
unless the user said otherwise.

### `POST /v1/ai/cardio-screen` `{image, exercise?}`
`200 {"reading": {found, minutes, distance_km, incline, speed, level, kcal, note}, model, usage}`.
The numbers on a cardio machine's screen, metric (`speed` in km/h; the note
says when it converted). Anything not on the screen is `null`. Send it as
`cardio_actual` on the block.

## Gym

```ts
type Muscle = "upper chest" | "mid chest" | "lower chest" | "front delts" | "side delts" | "rear delts"
            | "lats" | "upper back" | "traps" | "lower back" | "biceps" | "triceps" | "forearms"
            | "quads" | "hamstrings" | "glutes" | "adductors" | "abductors" | "calves" | "abs" | "obliques"

type Exercise = { id: string, name: string, kind: "strength" | "cardio",
                  muscle_group: string | null, equipment: string | null,
                  muscles: Muscle[],              // main one first; [] for cardio
                  media_url: string | null,       // stock photo, an app path ("/exercises/butterfly.jpg")
                  gym_photo_url: string | null,   // your own photo of it, an app path ("/exercise-photos/…?v=…")
                  aliases: string[],              // other names: "stairmaster", "rdl"
                  mine: boolean,                  // one of your own (you can share it)
                  visibility: Visibility,         // yours only; library ones are "private"
                  matched_alias?: string }        // search only: the alias that matched

type PlannedSet = { warmup: boolean, target_kg: number | null,
                    target_reps: number | null, to_failure: boolean }

// Which fields a machine has is up to the app (a treadmill has incline and
// speed, a bike a level, a rower a distance). kcal only comes from a screen.
type Cardio = { minutes: number, incline: number | null, speed: number | null,
                level?: number | null, distance_km?: number | null, kcal?: number | null }

type TemplateBlock = {
  id: string, position: number, exercise: Exercise,
  sets: PlannedSet[],                       // strength
  cardio: Cardio | null,
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
### `POST /v1/exercises` `{name, kind, muscle_group?, equipment?, muscles?, picture_from?}` → `201 {"exercise": Exercise}`
`muscles`: up to 3 `Muscle`s. `picture_from`: an exercise you can use whose
stock photo the new one borrows (from `POST /v1/ai/exercise`). `409` if you
already have one by that name.

### Your photo of a machine
- `PUT /v1/exercises/{id}/photo` `{media_type, data}` (base64, up to 600 KB; send a ~800 px JPEG) → `200 {"exercise": Exercise}`
  Any exercise you can use, library or yours; only you see it on library ones.
- `DELETE /v1/exercises/{id}/photo` → `200 {"exercise": Exercise}`
- `GET /v1/exercise-photos/{id}` (no auth; the web app serves it at `/exercise-photos/{id}`) → the image, cached for good.

### Sharing exercises
Your own exercises can be private (default), shown to friends, or public in the
Shop. Adding someone else's copies it into yours, so templates and sessions
only use the library and your own. Friends see your gym photo; the Shop shows
only the stock picture.

```ts
type SharedExercise = Exercise & { owner: Person, added_id: string | null }  // your copy, if you have one
```
- `PUT /v1/exercises/{id}/visibility` `{visibility}` → `200 {"exercise": Exercise}` (yours only, else `404`)
- `GET /v1/exercises/shared?scope=friends|public&q=` → `200 {"exercises": SharedExercise[]}` (newest first, 60 max)
  `friends`: what friends share (friends-only or public); `public`: the Shop, everyone's but yours.
- `POST /v1/exercises/{id}/add` → `200 {"exercise": Exercise}` (your copy; adding again returns it)

### Muscles that need work
```ts
type MuscleStat = { muscle: Muscle, last_trained: string, sets_this_week: number, days_4_weeks: number }
type Nudge = { muscle: Muscle, text: string,       // "You haven't trained forearms in 2 weeks"
               days_since: number | null,           // null: not in the last 90 days
               exercises: { exercise: Exercise, last_kg: number | null }[],   // 1-2 to do
               add_to: { template_id: string, name: string, date: string } | null }  // next workout this week
type WeekExtra = { id: string, week_start: string, template_id: string, template_name: string,
                   exercise: Exercise, sets: PlannedSet[] }
```
- `GET /v1/gym/insights` → `200 {"muscles": MuscleStat[], "nudges": Nudge[], "extras": WeekExtra[]}`
  A block counts for its exercise's first two muscles once a working set is
  done. Up to two nudges, only for someone who trained on 3+ days in the last
  4 weeks: muscles lapsed 2+ weeks (longest first), then regulars not trained
  this week (from Thursday), then often-skipped ones (upper chest, rear and
  side delts, forearms, hamstrings, calves, abs, lower back) not trained in 90
  days. Muscles with extras planned this week are left out. `extras` are this
  week's not yet used.
- `POST /v1/gym/week-extras` `{template_id, date?, blocks: [{exercise_id, sets}]}` → `201 {"extras": WeekExtra[]}`
  Adds 1–6 exercises to one of your workouts for the week of `date` (default
  today) only: starting that workout that week appends them, once.
- `DELETE /v1/gym/week-extras/{id}` → `204` (only while unused)
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
                      cardio: Cardio | null,          // the plan
                      cardio_done: boolean,
                      cardio_actual: Cardio | null,   // what was done (typed or read off the screen)
                      sets: SessionSet[] }

type Session = { id: string, date: string, template_id: string | null, template_name: string | null,
                 template_version: number | null, status: "active" | "finished",
                 started_at: string, finished_at: string | null, blocks: SessionBlock[] }

type Proposal = { exercise_id: string, exercise_name: string, from_kg: number, to_kg: number }
```
- `POST /v1/sessions` `{date, template_id?}` → `201 {"session": Session}` (a copy of the template's current version, plus that week's extras for it)
- `GET /v1/sessions?from=&to=` → `200 {"sessions": Session[]}`
- `GET /v1/sessions/{id}` → `200 {"session": Session}`
- `POST /v1/sessions/{id}/blocks` `{exercise_id, sets?, cardio?}` → `201 {"session": Session}` (an extra exercise today only, with planned sets when given)
- `PATCH /v1/sessions/{id}/blocks/{block_id}` `{skipped?, cardio_done?, cardio_actual?}` → `200 {"session": Session}` (`cardio_actual: null` clears it)
- `PUT /v1/sessions/{id}/order` `{block_ids}` → `200 {"session": Session}`
  New order ("machine's taken, do it later"); must list every block once, else `400`.
- `POST /v1/sessions/{id}/rest` `{seconds, next?}` → `202 {ends_at}`
  A "Rest's over 💪" push (tag `rest-<session id>`, body "Next: <next>") after
  `seconds` (5–1800), even in quiet hours, so it reaches a locked phone. A new
  rest replaces the old one. `409` once the workout is finished.
- `DELETE /v1/sessions/{id}/rest` → `204` (cancels it)
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
- `GET /v1/progress/photos` → `{"photos": ProgressPhoto[], "enabled": boolean, "limit": 500}` (newest first)
  `ProgressPhoto = {id, taken_on, pose: "front" | "side" | "back" | "other", url, content_type, weight_kg: number | null, created_at}`.
  Private: only their owner ever sees them, through signed links valid for
  `PHOTO_URL_TTL`. `weight_kg` is the latest weigh-in on or before `taken_on`.
- `POST /v1/progress/photos` `{media_type, data, taken_on?, pose?}` → `201 {"photo": ProgressPhoto}`
  Base64 up to 2 MB (send a ~1200 px JPEG); `taken_on` defaults to today and
  can't be in the future. `503 photos_unavailable` without photo storage,
  `409 photo_limit` past 500.
- `DELETE /v1/progress/photos/{id}` → `204`
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
type InviteLink = { id: string, url?: string, status: "open" | "accepted" | "revoked" | "expired",
                    accepted_by: { id: string, name: string } | null, counts_as_referral: boolean,
                    expires_at: string, created_at: string }
```
- `POST /v1/invite-links` `{}` → `201 {"invite_link": InviteLink}` (`url` = `${APP_URL}/join/<token>`).
  Each call makes a new link, so you can invite several people. 20 open links at most: `429` code `too_many_links`.
- `GET /v1/invite-links` → `200 {"invite_links": InviteLink[], "referrals": {joined, needed}}`.
  Open links carry their `url` again, so they can be copied until someone uses them. The token
  is stored sealed (AES-GCM, key derived from `JWT_SECRET`), never in the clear; links made
  before this have no `url`.
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
  weekly_summary: boolean    // their week on the Friends tab (WeekSummary), never calories
  meals: boolean             // what you log (names and times, never calories): your profile and friends' suggestions
  training_now: boolean      // "is at the gym" while a workout is going, and friends can join it
  default_visibility: Visibility  // what new saved meals, workouts and routines start as
}
type Friend = { id: string, name: string, avatar_url: string | null, since: string,
                last_workout_on: string | null, notify_workouts: boolean }
type FeedItem = { id: string, actor: { id: string, name: string, avatar_url: string | null },
                  kind: "workout_finished" | "record" | "weight_milestone" | "streak"
                      | "workout_started"   // training now; gone once they finish, hidden after 4 h
                      | "shared_item",      // put a workout, meal or routine out for friends (data.url)
                  text: string,              // "Upper-1 done: 4 exercises, 38 min"
                  data: Record<string, unknown>,
                  created_at: string, cheers: number, cheered_by_me: boolean }
// Someone's week so far: Monday to today in *their* timezone. Days only say
// whether they hit the target, never how much was eaten.
type WeekSummary = {
  week_start: string,          // the Monday
  days_logged: number,
  days_on_target: number,      // logged and calories within ±10% of their target
  days_protein_hit: number,    // logged and protein at least 90% of their target
  goal_days: number,           // 5: days on target that make the week's goal
  goal_hit: boolean,           // days_on_target >= goal_days
  streak: number, active_today: boolean,
  workouts: number | null,     // finished this week; null when they don't share workouts
  days: { date: string, logged: boolean, on_target: boolean, protein_hit: boolean }[]  // Mon–Sun
}
```
- `GET /v1/friends` → `200 {"friends": Friend[]}`
- `GET /v1/friends/week` → `200 {"me": WeekSummary, "friends": {person: Person, since: string, summary: WeekSummary | null}[]}`
  (`summary` is null when that friend turned `weekly_summary` off; goal hits first, then most days on target)
- `DELETE /v1/friends/{user_id}` → `204`
- `PATCH /v1/friends/{user_id}` `{notify_workouts}` → `200 {"friend": Friend}` (push me when this friend finishes a workout)
- `GET /v1/sharing` / `PUT /v1/sharing` → `{"sharing": Sharing}` (what all my friends can see; defaults: workouts,
  records, streaks, weekly summary and training now on, the rest off, `default_visibility` private).
  A PUT changes only the fields it sends. With `"apply_to_existing": true` and a friends or public
  `default_visibility`, everything still private (saved meals, workouts, routines) takes that
  visibility too; public stays public. The response then has `"opened": {templates, meals, routines}`
  (counts), and friends get one "shared …" feed item and push.
- New saved meals, workouts and routines created without a `visibility` start as `default_visibility`.
  The first time an item leaves private, friends get a `shared_item` feed item and a push
  (`friend_shares`), once per item.
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
  meal: (Macros & { date: string, name: string, meal_name: string, items: EntryItem[], icon?: FoodIcon }) | null,  // the friend's part (keeps its icon when added)
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
    On a meal that was split, that's your part as it is now.
  - 1 to 10 friends; anyone who isn't a friend is `403` code `not_friends`.
    Sending the same meal to someone it's still waiting for, or who already
    added it, does nothing for them. The entry's `shared_with` shows who has it.
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
- `GET /v1/shares/history?direction=received|sent&before=<RFC 3339 time>` →
  `200 {"items": ShareHistoryItem[]}`: everything shared with you (`received`,
  the default) or by you (`sent`), whatever the answer, newest first, 30 a
  page. Pass the last item's `created_at` as `before` for the next page. One
  send to several friends is one `sent` item. Shares from people who are no
  longer friends stay listed.
  ```ts
  type ShareHistoryItem = {
    id: string                       // received: the share (accept/decline it while pending)
    kind: "meal" | "template" | "routine"
    name: string
    kcal: number | null              // meals: the part each person got
    split_ways: number | null
    created_at: string
    from: Person                     // sent: you
    // received: you first, then the others a meal was split with; sent: everyone you sent it to
    recipients: (Person & { status: "pending" | "accepted" | "declined", responded_at: string | null })[]
  }
  ```

The friend gets a push ("Bhavish split Pizza with you", "Bhavish shared a
workout with you") that opens Today or Gym, where waiting shares are shown.
Push tags start with `share-`; the web app also pops up each new share once.

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
  routines: ShopItem[], templates: ShopItem[], meals: ShopItem[],  // what they share with you, newest first
  summary: WeekSummary | null   // yours, or a friend's when they share it; null otherwise
}
```
On your own id, it shows what you share (friends + public). `404` unless it's you,
a friend, or someone with something public.

For you and your friends, `PersonView` also has:
```ts
  training: LiveSession | null,      // their workout going now (when they share training_now)
  meals_today: FriendMeal[] | null,  // what they logged on their today, when they share meals; null otherwise
  activity: FeedItem[],              // their recent feed items you can see (12)
  notify_workouts?: boolean          // friends only: you get a push when they train
type LiveSession = { id: string, person: Person, template_name: string | null,
  started_at: string, finished_at: string | null,
  exercises_total: number, exercises_done: number, sets_done: number,
  current: string | null,            // the exercise they're on
  last_set: { exercise: string, kg: number | null, reps: number | null, at: string } | null }  // kg only with workout_details
type FriendMeal = { person: Person, entry_id: string, name: string, meal_name: string, icon: string | null, logged_at: string }
```

### Training together
- `POST /v1/people/{id}/join-workout` → `201 {"session": Session}`. Starts your own copy of the workout
  that friend has going (their template is copied once, `copied_from` them, and reused next time) and
  links the two sessions. `404` code `not_training` when they aren't training or don't share it;
  `409` code `in_workout` when you already have one going. They get a push (`friend_training`).
- `GET /v1/sessions/{id}/partners` → `200 {"partners": LiveSession[]}`: who you're training with in
  that session of yours (both sides see each other). Weights only when that person shares workout details.
- Starting a session for today posts `workout_started` and pushes friends who have `friend_training`
  on and haven't muted that friend's workouts: "Ravi is at the gym 🏋️". Finishing removes it.

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

### Admin: users (admins only; others get `403`)
What the admin app (`admin/`) shows and changes about a person. Reads reuse the
app's own shapes (`SavedMeal`, `Entry`, `Template`, `Routine`, `Session`,
`Friend`, `Billing`, `Profile`, `Goal`) for the user in the path.

```ts
type AdminUser = {
  id: string, email: string, name: string,        // name = Google name
  display_name: string | null,                    // null before onboarding
  avatar_url: string | null,
  role: "admin" | "member",
  plan: "free" | "pro",                           // as stored; use is_pro
  pro_source: "admin" | "referrals" | "subscription" | null,
  pro_until: string | null,                       // null = forever
  is_pro: boolean,                                // plan = pro and pro_until not passed
  admin_email: boolean,                           // in ADMIN_EMAILS: always admin + Pro
  onboarded: boolean,
  invited_by: Person | null,
  created_at: string, last_login_at: string | null,
  suspended_at: string | null, suspended_reason: string | null,
  counts: { saved_meals: number, templates: number, routines: number,
            sessions_finished: number, friends: number, referrals: number }
}
```
- `GET /v1/admin/users?q=&plan=free|pro&role=admin|member&status=active|suspended&limit=50&offset=0`
  → `200 {"users": AdminUser[], "total": number}`. Newest first; `q` matches email, name
  or display name; `limit` ≤ 100.
- `GET /v1/admin/users/{id}` → `200 {"user": AdminUser, "billing": Billing, "profile": Profile|null, "goal": Goal|null}`
- `PUT /v1/admin/users/{id}/pro` `{until: string|null}` → `200 {"user"}`. Pro from an admin
  (`pro_source: "admin"`), forever or until a future time. `400` when `until` has passed, or
  when it would cut short Pro forever from referrals.
- `DELETE /v1/admin/users/{id}/pro` → `200 {"user"}` (back to free; `400` for `admin_email`)
- `PUT /v1/admin/users/{id}/role` `{role}` → `200 {"user"}`. `400` when demoting yourself or
  an `admin_email`. The new role shows up in their next access token.
- `POST /v1/admin/users/{id}/suspend` `{reason?}` (≤ 300 chars) → `200 {"user"}`. Revokes every
  refresh token and blocks sign-in; an access token already issued keeps working until it
  expires (`ACCESS_TTL`, 15 min). `400` on yourself.
- `DELETE /v1/admin/users/{id}/suspend` → `200 {"user"}`
- `GET /v1/admin/users/{id}/saved-meals` → `200 {"saved_meals": SavedMeal[]}`
- `GET /v1/admin/users/{id}/entries?from=&to=` → `200 {"entries": Entry[], from, to}`: the
  food log, newest day first (default the last 14 days, at most 92). Photos aren't included.
- `GET /v1/admin/users/{id}/templates` → `200 {"templates": Template[]}`
- `GET /v1/admin/users/{id}/routines` → `200 {"routines": Routine[]}`
- `GET /v1/admin/users/{id}/sessions?from=&to=` → `200 {"sessions": Session[], from, to}`
  (default the last 90 days) and `GET /v1/admin/users/{id}/sessions/{session_id}` → `200 {"session": Session}`
- `GET /v1/admin/users/{id}/friends` → `200 {"friends": Friend[]}`

Hiding any of their meals, templates or routines (whatever the visibility) uses
`POST/DELETE /v1/admin/shop/{kind}/{id}/hide` above.

### Admin: notifications (admins only)
Every push and email the server tried to send. A push is recorded once per
person it was meant for; `kind` names it (`friend_joined`, `shop_hidden`,
`meal`, `weekly_recap`…) and an email's `kind` is its template (`welcome`…).

```ts
type SentNotification = {
  id: number,                     // newest first; also the paging cursor
  channel: "push" | "email",
  user: Person | null,            // null: an email to an address with no account
  recipient: string | null,       // email address
  kind: string,
  title: string,                  // push title / email subject
  body: string | null, url: string | null,   // push only
  status: "sent" | "partial" | "failed" | "no_devices" | "quiet_hours" | "disabled",
  devices: number, delivered: number,        // push: subscriptions tried / delivered to
  error: string | null,
  created_at: string
}
```
`partial`: some devices got it. `no_devices`: push was on but they have no
subscription. `quiet_hours`: skipped by their quiet hours. `disabled`: no VAPID
keys / no SMTP on this server, so nothing left it.

- `GET /v1/admin/notifications?channel=&status=&kind=&user_id=&q=&before=&limit=50`
  → `200 {"notifications": SentNotification[], "next_before": number|null}`. `q`
  matches title, body or recipient; pass `next_before` as `before` for the next page;
  `limit` ≤ 200.
- `GET /v1/admin/notifications/stats` → `200 {"since": string, "counts": {"push": {status: n}, "email": {status: n}}}`
  over the last 24 hours (every status present, 0 when none).

Kept `NOTIFICATION_RETENTION_DAYS` (default 90).

### Admin: audit log (admins only)
One row per API request, written in the background
within about a second. Not recorded: `GET /health` and reads of these two
logs (`GET /v1/admin/audit`, `GET /v1/admin/notifications…`), which the admin
app polls in Live mode. Bodies are never stored; a 4xx/5xx keeps its
`error.message`. A path holding a secret (an invite token) is stored as its
route (`/v1/invite-links/preview/{token}`).

```ts
type AuditEntry = {
  id: number, at: string,
  user: Person | null,            // null: signed out or a bad token
  role: "admin" | "member" | null,
  method: string, path: string,
  route: string | null,           // "GET /v1/days/{date}"; null when nothing matched
  query: string | null,
  status: number, duration_ms: number,
  ip: string | null,              // X-Client-IP from the BFF (see above)
  user_agent: string | null,
  error: string | null
}
```
- `GET /v1/admin/audit?user_id=&method=&status=&q=&before=&limit=100`
  → `200 {"entries": AuditEntry[], "next_before": number|null}`. `status` is a class
  (`2xx`…`5xx`) or a code (`404`); `q` matches the path; `limit` ≤ 200.

Kept `AUDIT_RETENTION_DAYS` (default 30).

## Notifications (Web Push)

```ts
type NotificationPrefs = {
  friend_workouts: boolean, cheers: boolean, meal_nudges: boolean,
  workout_day: boolean, weigh_in: boolean, weekly_checkin: boolean,
  streak_risk: boolean, friend_goals: boolean,
  quiet_from: string | null, quiet_to: string | null   // "22:00", "07:00"
}
```
`streak_risk`, `friend_goals`, `friend_shares` and `friend_training` default to on. A PUT changes only the fields it sends.
```ts
  friend_shares: boolean,    // a friend shared a workout, meal or routine
  friend_training: boolean,  // a friend is at the gym, or joined your workout
```
- `GET /v1/push/vapid-public-key` → `200 {"key": "B..."}` (no auth)
- `POST /v1/push/subscriptions` `{endpoint, keys: {p256dh, auth}, user_agent?}` → `201`
- `DELETE /v1/push/subscriptions` `{endpoint}` → `204`
- `GET /v1/notification-prefs` / `PUT /v1/notification-prefs` → `{"prefs": NotificationPrefs}`

Scheduled pushes are checked every minute, in each user's local time. Each one goes out at
most once (tracked in `notification_log`), up to an hour late after a restart, and never in
quiet hours:

| Push | Switch | When | Only if |
|---|---|---|---|
| Meal reminder | `meal_nudges` | the meal's `remind_at` | nothing logged in that meal today; gym-day meals only on gym days |
| Streak at risk | `streak_risk` | 20:00 | streak of 2+ days and nothing logged or trained today |
| Weekly recap | `weekly_checkin` | Sunday 19:00 | something logged this week |
| A friend hit their goal | `friend_goals` | the friend's Sunday 19:00 | they hit the goal and share their weekly summary |
| Friends on target today | `friend_goals` | 20:30 | a friend who shares their week is on target today and you have 250+ kcal to go (checked once a day) |
| Weigh-in | `weigh_in` | 08:00 | due by `weigh_in_cadence` (Mon/Wed/Fri, Mondays, the 1st, or the 1st of each quarter) and no weigh-in today |
| Workout day | `workout_day` | 09:00 | the weekly plan has a workout today and none is finished |

## System

- `GET /health` → `{"status":"ok"}` (checks the database)
