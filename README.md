# adebite

A private calorie and gym tracker for a few friends: log food (photo → AI
estimate you can edit, saved meals with add-ons, restaurant menus, barcode),
run gym templates like Upper-1 with per-day changes and a swipe review, and
watch weight, calories and lifts trend the right way.

| Part | What | Where |
|---|---|---|
| API | Go 1.24, stdlib `net/http`, Postgres (pgx), Google sign-in | [`api/`](api) |
| Web | Next.js PWA (App Router), talks to the API through a small BFF | [`web/`](web) |
| Admin | Next.js back office: users, plans, what they share, suspensions | [`admin/`](admin) |
| Docs | API contract, auth flow, designs | [`docs/`](docs) |
| Emails | React Email templates, exported to Go templates the API embeds | [`emails/`](emails) |

## Run it locally

```sh
# 1. Postgres
docker run -d --name fuel-pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=fuel postgres:16

# 2. API (http://localhost:8080)
cd api
cp .env.example .env          # set JWT_SECRET, GOOGLE_CLIENT_ID/SECRET, ADMIN_EMAILS, an AI key
make vapid >> .env            # Web Push keys
make run                      # migrations run on start

# 3. Web (http://localhost:3000)
cd ../web
cp .env.example .env.local
npm install && npm run dev

# 4. Admin, optional (http://localhost:3001)
cd ../admin
cp .env.example .env.local
npm install && npm run dev
```

New users get two starter templates, Upper-1 and Lower-1, so the Gym tab isn't
empty. Weights start blank and fill in from the first session.

Google sign-in needs an OAuth client (type *Web application*) with the redirect
URI `http://localhost:3000/api/auth/google/callback` (and
`http://localhost:3001/api/auth/google/callback` for the admin app, whose origin
also goes in the API's `ALLOWED_ORIGINS`). See [docs/auth.md](docs/auth.md).

## Who can get in

Anyone with a Google account can sign up. People in `ADMIN_EMAILS` are admins
and always have Pro. Friend links (`Me → Add friend`, single use, 14 days) make
you friends and count toward the inviter's 8 referrals for Pro.

## Free and Pro

One paid tier, **Pro**: unlimited AI. **Free**: 10 photo estimates a month (text
and restaurant estimates aren't counted). **Invite 8 friends** who join through
your links and finish onboarding, and you get Pro forever. Pro can't be gifted.
Every user also has a fair-use rate limit, and there's a global monthly AI budget
cap (`AI_MONTHLY_BUDGET_USD`).

## Emails

The API sends a few transactional emails over SMTP (`SMTP_*` in `api/.env`;
without `SMTP_HOST` they're only logged):

| Email | When |
|---|---|
| `welcome` | Someone finishes onboarding: their daily target and three first steps |
| `friend-joined` | A friend who joined through your link finishes onboarding (progress to Pro) |
| `pro-unlocked` | That friend was your 8th: Pro forever |
| `photo-limit` | A free user uses their last photo estimate of the month |
| `weekly-recap` | Template only, not sent yet (needs a scheduler and an opt-out) |

Templates live in `emails/emails/*.tsx`. Illustrations are drawn in code by
`emails/scripts/make-assets.mjs` into `web/public/email`, which the web app
serves, so emails load them from `APP_URL` (or `EMAIL_ASSETS_URL`).

```sh
cd emails && npm install
npm run dev        # live preview at http://localhost:3002
npm run assets     # redraw web/public/email/*.png
npm run build      # export to api/internal/email/templates (commit the output)
npm run preview    # out/*.html with local images, to open in a browser
```

## Tests

```sh
cd api
make test                                   # unit tests
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/fuel_test?sslmode=disable make test-db
```

`test-db` resets the schema of the database it's given, so point it at a
throwaway one. It drives the whole API end to end: onboarding, meals, saved
meals with add-ons, barcode caching, friend links, the 10-photo limit, 8
referrals → Pro, a gym session with a skipped block, the "raise your template"
prompt, the friends feed and sharing switches.
