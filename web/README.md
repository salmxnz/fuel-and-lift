# adebite — web

The installable PWA for adebite: food log with AI photo estimates, gym
templates and workouts, progress, friends. Next.js 16 (App Router) + React 19 +
TypeScript + Tailwind CSS 4, talking to the Go API in `../api` through a
backend-for-frontend (BFF). The browser never sees a token.

## Run it

```bash
cd web
cp .env.example .env.local   # then fill it in
npm install
npm run dev                  # http://localhost:3000
```

| Variable           | Default                 | What it is |
| ------------------ | ----------------------- | ---------- |
| `API_URL`          | `http://localhost:8080` | The Go API base URL (no `/v1`). Server-only. |
| `APP_URL`          | `http://localhost:3000` | This app's public URL. Builds the OAuth redirect URI; `https://` also turns on `Secure` cookies. |
| `GOOGLE_CLIENT_ID` | (required)              | Google OAuth **Web** client id, same value as `api/.env`. The secret lives only in Go. |
| `JWT_SECRET`       | (required)              | Same HS256 secret as the Go API. Next only *verifies* access tokens with it. |

Variables are validated on first use (`config/env.ts`), so `npm run build`
works without them; a missing value shows up as a clear error at sign-in.

**Google OAuth redirect URI.** In Google Cloud console → Credentials → your Web
client, add `${APP_URL}/api/auth/google/callback` to *Authorised redirect URIs*
(e.g. `http://localhost:3000/api/auth/google/callback` and your production
URL). See `../docs/auth.md`.

Scripts: `npm run dev`, `npm run build`, `npm start` (port 3000), `npm run lint`,
`npm run typecheck`, `npm run icons` (redraws `public/icons/*.png` with sharp).

## How auth and the BFF work

```
browser ──/api/v1/*──► Next (proxy.ts → app/api/v1/[...path]) ──Bearer──► Go /v1/*
           cookies: fl_access, fl_refresh, fl_csrf (all httpOnly)
```

- **Sign-in** (`app/api/auth/google/start`, `.../callback`): authorization code
  + PKCE (S256). `start` stores `{state, verifier, callbackUrl, invite}` in a
  10-minute httpOnly `fl_oauth` cookie and redirects to Google
  (`openid email profile`, `prompt=select_account`). `callback` checks `state`,
  POSTs `{code, code_verifier, redirect_uri, invite_token?}` to Go
  `/v1/auth/google`, stores access + csrf (from the body) and refresh (from Go's
  `Set-Cookie`) as `fl_*` cookies, and sends you to `/onboarding` or the
  callback URL / `/today`. Failures land on `/login?error=…` (403 →
  "Your Google email isn't verified.").
- **Silent refresh** (`proxy.ts`, Next 16's middleware): every page and
  `/api/v1` request is checked; an expired `fl_access` with a valid
  `fl_refresh` is refreshed against Go (`/v1/auth/refresh`, refresh + csrf
  cookies and `X-CSRF-Token`). Rotated tokens go on the response *and* on the
  forwarded request, so Server Components and the BFF see the new token in the
  same request. Concurrent requests holding the same single-use refresh token
  share one refresh call. Unauthenticated pages redirect to
  `/login?callbackUrl=…`; unauthenticated `/api/v1` calls get `401` JSON.
- **Public** (no session needed): `/login`, `/join/*`, `/offline`,
  `/api/auth/*`, static assets, `manifest.webmanifest`, `sw.js`, `/icons/*`.
- **BFF pass-through** (`app/api/v1/[...path]/route.ts`): forwards
  GET/POST/PUT/PATCH/DELETE to `${API_URL}/v1/<path>?<query>` with
  `Authorization: Bearer <fl_access>`, a JSON body only, and no incoming cookies
  or other client headers. Path segments are validated (no `..`, no encoded
  slashes) and re-encoded, the target origin must equal `API_URL`'s, redirects
  are not followed, non-GET requests from another origin are rejected, and
  Go's status + JSON come back unchanged.
- **Client** (`lib/api/client.ts`): `api.get/post/put/patch/del` against
  `/api/v1/...`, throwing `ApiError {status, message, code}`. A 401 sends you to
  `/login`. `lib/api/use-api.ts` is a small fetch-and-cache hook (refetches when
  the tab becomes visible). Types for every API shape are in
  `lib/api/types.ts` (mirror of `../docs/api.md`).
- **Server** (`lib/auth/session.ts`): `getSession()` verifies `fl_access`
  locally; `getMe()` calls `/v1/auth/me`. The signed-in layout
  (`app/(app)/layout.tsx`) uses it to require onboarding.
- **Sign-out**: `POST /api/auth/logout` revokes at Go and clears every `fl_*`
  cookie.

## Route map

| Route | Screen (design) |
| ----- | --------------- |
| `/login` | Dark sign-in (Join) with *Continue with Google* and friendly errors |
| `/join/[token]` | Invite preview (server-side `GET /v1/invite-links/preview/{token}`); accept if signed in, else Google with `?invite=` |
| `/onboarding` | One question per screen: name, sex, birth date, height (cm or ft/in), weight (kg/lb), activity, goal, goal weight, pace (live `POST /v1/plan/preview`, Onboarding-Pace), plan summary, gym days (optional), install + notifications, done → `POST /v1/onboarding`. Answers persist in `sessionStorage`. |
| `/today` (`?date=YYYY-MM-DD`) | Main: week strip, calorie + macro card, meals, add-on chips, entry edit sheet, "Add a meal today" |
| + button | Add-Menu → Add-Food sheet (meal chips, photo, my meals, restaurant, describe, barcode, manual, "Again") / Workout / Weigh-in sheet |
| `/log/photo`, `/log/describe` | AI-Estimate: resize to 768 px JPEG, estimate, question chips refine, editable rows (grams scale, kcal pins), log or save |
| `/log/restaurant` | Chain-Menu: chains, "Your places" (`/v1/foods`), include/exclude rows, official vs AI tags |
| `/log/manual`, `/log/barcode` | Manual entry; barcode via `BarcodeDetector` or typed number → `/v1/foods/barcode/{code}` |
| `/meals` | Meal-Settings: drag (pointer events) or arrow keys to reorder, rename, daily / gym days, add, delete |
| `/saved-meals` | Saved meals list + editor with add-ons; `?pick=1` logs one with chosen add-ons |
| `/gym` | Today's workout, weekly plan, templates, recent sessions |
| `/gym/templates/[id]` | Template editor (exercise search/create, sets, warm-up, to failure, cardio, rest, notes) → new version |
| `/gym/session/[id]` | Workout timeline: set ticks, rest timer (vibrates), swipe/skip with undo, extra set, extra exercise |
| `/gym/session/[id]/review` | Review: swipe cards (right done, left edit, up skipped), Accept all, finish, Update-Template sheet |
| `/progress` | Weight chart (SVG: dots, trend, dashed plan, goal), strength + records, calories this week |
| `/me` | Profile, Pro/referral card, settings links, sign out |
| `/friends`, `/friends/add` | Feed with cheers, friends with notify switch; invite link, copy/share, referrals, revoke |
| `/sharing` | Sharing switches + live preview, friend notification switches |
| `/photos` | Meal photos kept in R2: grid, "12 of 20" usage on free, select and delete |
| `/pro` | Paywall from `/v1/billing`; checkout `501` → "Payments are coming soon" |
| `/weigh-in` | Weigh-in form as a page (push notification target) |
| `/settings/notifications`, `/settings/goal`, `/settings/profile` | Push on/off + prefs + quiet hours; goal and targets; units, time zone, height, activity |
| `/offline` | Precached offline fallback |

Tab screens (`app/(app)/(tabs)`) get the floating glass nav; focused flows
(`app/(app)/(flow)`) don't.

## PWA

- `app/manifest.ts` → `/manifest.webmanifest` (standalone, start `/today`,
  theme/background `#FBEFF3`, icons 192/512/maskable-512, apple-touch 180).
- `public/sw.js` (hand-written): precaches the shell, network-first navigations
  with `/offline` fallback, cache-first `/_next/static`, never caches `/api`;
  `push` → `showNotification({title, body, url})`; `notificationclick` focuses
  or opens the URL. Registered by `components/pwa/sw-register.tsx`.
- `lib/push.ts`: `GET /api/v1/push/vapid-public-key` → `pushManager.subscribe`
  → `POST /api/v1/push/subscriptions`. iOS Safari outside the Home Screen app
  gets Share → *Add to Home Screen* instructions instead.
- Viewport `viewport-fit=cover`, safe-area padding everywhere, Apple web-app
  meta tags.

## Design system

Pastel pink and white; see `docs/brand/BRAND.md` for the palette, logo and
rules. Tokens live in `app/globals.css` (`@theme`): ground `#FBEFF3`, surface
white, ink (plum) `#2E1A24`, muted `#765A67`, lines `#ECD3DD`/`#F7E8EE`, pink
`#F6B8CA`, protein `#A82F61`, carbs `#EE8FB0`, fat `#F2B48C`, dark screens
`#2E1A24`; Login/Join use `.theme-blush` (pink). The logo is
`components/brand/logo.tsx`; `npm run icons` redraws `public/icons`.
Schibsted Grotesk is self-hosted from `app/fonts` (Fontsource, OFL) via
`next/font/local`, so the installed app renders offline and builds need no
network. The glass nav (`components/nav/glass-nav.tsx`) uses
`backdrop-filter: blur(18px) saturate(180%)` with a `motion` `layoutId` lens,
falls back to solid under `prefers-reduced-transparency`, and honours
`prefers-reduced-motion` via `MotionConfig`.
