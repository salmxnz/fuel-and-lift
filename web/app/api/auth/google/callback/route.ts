import { NextResponse, type NextRequest } from "next/server"
import { EnvError, getEnv } from "@/config/env"
import type { AuthGoogleRequest, AuthGoogleResponse } from "@/lib/api/types"
import { safeCallbackUrl } from "@/lib/auth/callback-url"
import { AUTH_COOKIES, writeAuthCookies } from "@/lib/auth/cookies.shared"
import { decodeOAuthCookie } from "@/lib/auth/pkce"
import { extractGoCookies } from "@/lib/auth/set-cookie"

export const dynamic = "force-dynamic"

function fail(request: NextRequest, error: string, invite?: string | null) {
  const target = new URL("/login", request.url)
  target.searchParams.set("error", error)
  if (invite) target.searchParams.set("invite", invite)
  const res = NextResponse.redirect(target)
  res.cookies.delete({ name: AUTH_COOKIES.oauth, path: "/api/auth/google" })
  return res
}

// Step 2: Google sends the user back with ?code&state. Check state against the
// fl_oauth cookie, let Go exchange the code (Go holds the client secret), then
// keep Go's tokens in our own httpOnly fl_* cookies.
export async function GET(request: NextRequest) {
  let env
  try {
    env = getEnv()
  } catch (err) {
    console.error(err instanceof EnvError ? err.message : err)
    return fail(request, "config")
  }

  const params = request.nextUrl.searchParams
  const oauth = decodeOAuthCookie(request.cookies.get(AUTH_COOKIES.oauth)?.value)

  const googleError = params.get("error")
  if (googleError) {
    return fail(request, googleError === "access_denied" ? "cancelled" : "google", oauth?.invite)
  }

  const code = params.get("code")
  const state = params.get("state")
  if (!oauth || !code || !state || state !== oauth.state) {
    return fail(request, "state", oauth?.invite)
  }

  const body: AuthGoogleRequest = {
    code,
    code_verifier: oauth.verifier,
    redirect_uri: `${env.appUrl}/api/auth/google/callback`,
    ...(oauth.invite ? { invite_token: oauth.invite } : {}),
  }

  let res: Response
  try {
    res = await fetch(`${env.apiUrl}/v1/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    })
  } catch {
    return fail(request, "unreachable", oauth.invite)
  }

  if (!res.ok) {
    const reason = res.status === 403 ? "invite_only" : res.status === 400 || res.status === 401 ? "google" : "server"
    return fail(request, reason, oauth.invite)
  }

  const data = (await res.json().catch(() => null)) as AuthGoogleResponse | null
  if (!data?.access_token || !data.csrf_token) return fail(request, "server", oauth.invite)

  const go = extractGoCookies(res.headers)
  if (!go.refreshToken) {
    // Without the refresh token the session would die in 15 minutes.
    console.error("Go /v1/auth/google returned no refresh_token Set-Cookie")
  }

  const destination = data.onboarded ? safeCallbackUrl(oauth.callbackUrl) : "/onboarding"
  const response = NextResponse.redirect(new URL(destination, env.appUrl))
  writeAuthCookies(response.cookies, {
    accessToken: data.access_token,
    csrfToken: go.csrfToken ?? data.csrf_token,
    refreshToken: go.refreshToken,
  })
  response.cookies.delete({ name: AUTH_COOKIES.oauth, path: "/api/auth/google" })
  response.headers.set("Cache-Control", "no-store")
  return response
}
