import type { NextResponse } from "next/server"

// Next-owned session cookies. The browser only ever sees these (never Go's own
// refresh_token / csrf_token cookies) and its JavaScript can read none of them.
// They're fla_* rather than the PWA's fl_*: cookies ignore the port, so on
// localhost the two apps would otherwise overwrite each other's session.
export const AUTH_COOKIES = {
  access: "fla_access",
  refresh: "fla_refresh",
  csrf: "fla_csrf",
  oauth: "fla_oauth",
} as const

export const AUTH_MAX_AGE = {
  access: 15 * 60, // ACCESS_TTL (15m)
  refresh: 60 * 24 * 60 * 60, // REFRESH_TTL_DAYS (60d)
  oauth: 10 * 60, // state + PKCE verifier
} as const

/**
 * Secure cookies need HTTPS. Use them whenever the app is served over https
 * (APP_URL) or, when APP_URL is unset, in production builds.
 */
export function cookieSecure(): boolean {
  const appUrl = process.env.APP_URL?.trim()
  if (appUrl) return appUrl.startsWith("https://")
  return process.env.NODE_ENV === "production"
}

export type AuthTokens = {
  accessToken: string
  csrfToken: string
  refreshToken?: string | null
}

type CookieSetter = Pick<NextResponse["cookies"], "set" | "delete">

/** Writes the fla_* session cookies onto a response (proxy, route handlers). */
export function writeAuthCookies(target: CookieSetter, tokens: AuthTokens) {
  // lax, not strict: the first page after Google's redirect must see them.
  const base = { httpOnly: true, secure: cookieSecure(), sameSite: "lax" as const, path: "/" }
  target.set(AUTH_COOKIES.access, tokens.accessToken, { ...base, maxAge: AUTH_MAX_AGE.access })
  target.set(AUTH_COOKIES.csrf, tokens.csrfToken, { ...base, maxAge: AUTH_MAX_AGE.refresh })
  if (tokens.refreshToken) {
    target.set(AUTH_COOKIES.refresh, tokens.refreshToken, { ...base, maxAge: AUTH_MAX_AGE.refresh })
  }
}

/** Removes every fla_* session cookie. */
export function clearAuthCookies(target: CookieSetter) {
  target.delete(AUTH_COOKIES.access)
  target.delete(AUTH_COOKIES.refresh)
  target.delete(AUTH_COOKIES.csrf)
}
