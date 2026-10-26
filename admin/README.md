# adebite admin

The back office: a Next.js app for admins to look people up and manage them.

- **Users**: everyone, newest first. Search by name or email, filter by plan,
  role and status.
- **A user**: profile, goal, plan and usage, then underline tabs for their
  meals (saved meals and the food diary), workouts, routines, sessions and
  friends. Meals, workouts and routines show who can see them (private,
  friends, public) and can be hidden from the Shop.
- **Actions**: grant Pro (forever or until a date) or revoke it, make or remove
  admins, suspend or lift a suspension.
- **Feedback**: bugs and ideas people send from Me → Feedback, with their
  screenshots. Filter by status (new, seen, done) and kind, and reply: the
  note shows on their Feedback screen.
- **Notifications**: every push and email the server tried to send (sent,
  failed, skipped for quiet hours or no devices, or off on the server), with
  24-hour counts. Kept 90 days.
- **Audit log**: every API request: who, route, status, time taken, IP and the
  error text. No bodies. Kept 30 days. Both logs have a Live mode, and each
  user's page has Notifications and Activity tabs with just their rows.

It talks to the same Go API as the PWA, only through the `/v1/admin/*` routes
(see "Admin: users" in [docs/api.md](../docs/api.md)), behind a small BFF like
`web/`'s: tokens stay in httpOnly `fla_*` cookies (not `fl_*`, so a local PWA
session on another port isn't overwritten). Only admins can sign in; Go checks
the role on every call as well.

## Run it

```sh
cp .env.example .env.local   # same GOOGLE_CLIENT_ID and JWT_SECRET as the API
npm install
npm run dev                  # http://localhost:3001
```

Sign-in uses the PWA's Google OAuth client. Two one-time settings:

1. Add `http://localhost:3001/api/auth/google/callback` (and the production
   admin URL's callback) to the client's **Authorised redirect URIs**.
2. Add the admin origin to the API's `ALLOWED_ORIGINS` (`api/.env`), e.g.
   `ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001`.

People in `ADMIN_EMAILS` are admins; they can make others admins from here.

```sh
npm run typecheck && npm run lint && npm run build
```
