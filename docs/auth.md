# Authentication

Google sign-in only, invite-only, cookie-backed sessions with rotating refresh
tokens. Modelled on the nex-dash-forecast backend: the Go API issues tokens, the
Next.js app is a BFF that keeps them in httpOnly cookies, and the browser's
JavaScript never sees a token.

## Pieces

| Thing | Lifetime | Where | Purpose |
| --- | --- | --- | --- |
| Access token | 15m (`ACCESS_TTL`) | `fl_access` cookie (httpOnly), set by Next | HS256 JWT with `user_id` + `role`, sent to Go as `Authorization: Bearer`. |
| Refresh token | 60d (`REFRESH_TTL_DAYS`) | `fl_refresh` cookie (httpOnly) | 256-bit opaque value. Only its SHA-256 hash is stored. Single use: every refresh rotates it. |
| CSRF token | 60d | `fl_csrf` cookie | Double-submit value Go requires on `refresh` and `logout`. |
| OAuth state + PKCE verifier | 10m | `fl_oauth` cookie (httpOnly) | Ties the Google callback to the browser that started it. |

The access token is verified by Next (same `JWT_SECRET` as Go) so most requests
need no round trip.

## Sign-in flow (authorization code + PKCE)

1. **Start.** The user taps *Continue with Google*. `GET /api/auth/google/start`
   (a Next route handler) makes a random `state`, a PKCE `code_verifier` and its
   S256 `code_challenge`, stores `{state, verifier, callbackUrl}` in the
   `fl_oauth` cookie and redirects to
   `https://accounts.google.com/o/oauth2/v2/auth` with
   `client_id`, `redirect_uri=${APP_URL}/api/auth/google/callback`,
   `response_type=code`, `scope=openid email profile`, `state`,
   `code_challenge`, `code_challenge_method=S256`, `prompt=select_account`.
2. **Callback.** `GET /api/auth/google/callback?code&state` checks `state`
   against the cookie, then calls Go: `POST /v1/auth/google`
   `{code, code_verifier, redirect_uri}`.
3. **Go** exchanges the code at Google's token endpoint (with the client
   secret, which only Go holds), verifies the returned ID token (issuer,
   audience = `GOOGLE_CLIENT_ID`, expiry, signature via Google's JWKS,
   `email_verified`), then checks the allow-list: the email is in
   `ADMIN_EMAILS` (becomes `admin`) or has an open invite (becomes `member`).
   It upserts the user by Google `sub`, issues the token triple and returns
   `{access_token, csrf_token, user, onboarded}` plus `Set-Cookie` for the
   refresh and csrf tokens.
4. **Next** copies access, refresh and csrf into its own `fl_*` cookies and
   redirects to `/onboarding` when `onboarded` is false, otherwise to the
   callback URL or `/today`.

Why the code flow and not the Google One Tap / GIS popup: an installed iOS PWA
runs standalone, where popups are unreliable. A full-page redirect works the
same in Safari, the installed PWA and Android Chrome.

`POST /v1/auth/google` also accepts `{id_token}` for a future native wrapper or
the GIS button; Go verifies it the same way.

## Silent refresh

Server Components cannot set cookies, so `proxy.ts` (Next 16's middleware)
refreshes first: if `fl_access` is missing or expired but `fl_refresh` exists, it
calls `POST /v1/auth/refresh` with the refresh + csrf cookies and the
`X-CSRF-Token` header, then writes the rotated cookies onto the response. Pages
therefore always see a fresh access token.

## Sign-out

`POST /api/auth/logout` (Next) → `POST /v1/auth/logout` (Go revokes the refresh
token) → Next clears every `fl_*` cookie.

## Who can get in

- `ADMIN_EMAILS` (comma separated) bootstraps the first admin.
- **Friend links** are the normal way in. A user shares `${APP_URL}/join/<token>`.
  The join page shows who invited you (`GET /v1/invite-links/preview/{token}`,
  no auth). *Continue with Google* goes to `/api/auth/google/start?invite=<token>`;
  the token rides in the `fl_oauth` cookie and is sent to Go as `invite_token`.
  Already signed in? The join page calls `POST /v1/invite-links/accept` instead.
- Admins can also pre-approve an email with `POST /v1/admin/invites {email}`.

Nobody else can create an account.

## Google Cloud setup

1. Google Cloud console → APIs & Services → Credentials → *Create OAuth client
   ID* → Web application.
2. Authorised redirect URIs: `http://localhost:3000/api/auth/google/callback`
   and your production `https://<app>/api/auth/google/callback`.
3. Put the client id in both `api/.env` (`GOOGLE_CLIENT_ID`) and
   `web/.env.local` (`GOOGLE_CLIENT_ID`); the secret goes in `api/.env` only.
