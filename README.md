# Fuel & Lift

A private calorie and gym tracker for a few friends: log food (photo → AI
estimate you can edit, saved meals with add-ons, restaurant menus, barcode),
run gym templates like Upper-1 with per-day changes and a swipe review, and
watch weight, calories and lifts trend the right way.

| Part | What | Where |
|---|---|---|
| API | Go 1.24, stdlib `net/http`, Postgres (pgx), Google sign-in | [`api/`](api) |
| Web | Next.js PWA (App Router), talks to the API through a small BFF | [`web/`](web) |
| Docs | API contract, auth flow, designs | [`docs/`](docs) |

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
```

Google sign-in needs an OAuth client (type *Web application*) with the redirect
URI `http://localhost:3000/api/auth/google/callback`. See [docs/auth.md](docs/auth.md).

## Who can get in

The app is invite-only. People in `ADMIN_EMAILS` can always sign in. Everyone
else needs a friend link (`Me → Add friend`, single use, 14 days) or an email an
admin added. Opening a link makes you friends.

## Free and Pro

One paid tier, **Pro**: unlimited AI. **Free**: 10 photo estimates a month (text
and restaurant estimates aren't counted). **Invite 8 friends** who join through
your links and finish onboarding, and you get Pro forever. Pro can't be gifted.
Every user also has a fair-use rate limit, and there's a global monthly AI budget
cap (`AI_MONTHLY_BUDGET_USD`).

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
