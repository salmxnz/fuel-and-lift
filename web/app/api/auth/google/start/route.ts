import { NextResponse, type NextRequest } from "next/server"
import { publicUrl, signInOrigin } from "@/lib/auth/public-origin"
import { EnvError, getEnv } from "@/config/env"
import { safeCallbackUrl } from "@/lib/auth/callback-url"
import { AUTH_COOKIES, AUTH_MAX_AGE, cookieSecure } from "@/lib/auth/cookies.shared"
import { codeChallengeS256, encodeOAuthCookie, randomToken } from "@/lib/auth/pkce"

export const dynamic = "force-dynamic"

const INVITE_RE = /^[A-Za-z0-9_-]{4,200}$/

// Step 1 of Google sign-in: make state + a PKCE verifier, remember them (with
// the optional friend-link invite and where to land afterwards) in a 10-minute
// httpOnly cookie, then redirect the whole page to Google.
export async function GET(request: NextRequest) {
  let env
  try {
    env = getEnv()
  } catch (err) {
    console.error(err instanceof EnvError ? err.message : err)
    return NextResponse.redirect(publicUrl("/login?error=config", request))
  }

  const params = request.nextUrl.searchParams

  // Sign in on the origin the browser is already on (APP_URL or its www twin)
  // so the fl_oauth cookie, Google's redirect and the session cookies all land
  // on one site. Anywhere else (a preview URL, a LAN IP), hop to APP_URL first.
  // `hop` stops a loop if a proxy reports an unexpected host.
  const origin = signInOrigin(request, env.appUrl)
  if (!origin && !params.has("hop")) {
    const hop = new URL("/api/auth/google/start", env.appUrl)
    hop.search = request.nextUrl.search
    hop.searchParams.set("hop", "1")
    return NextResponse.redirect(hop)
  }
  const redirectUri = `${origin ?? env.appUrl}/api/auth/google/callback`

  const inviteRaw = params.get("invite")
  const invite = inviteRaw && INVITE_RE.test(inviteRaw) ? inviteRaw : null
  const callbackUrl = safeCallbackUrl(params.get("callbackUrl"))

  const state = randomToken(24)
  const verifier = randomToken(48)
  const challenge = await codeChallengeS256(verifier)

  const google = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  google.searchParams.set("client_id", env.googleClientId)
  google.searchParams.set("redirect_uri", redirectUri)
  google.searchParams.set("response_type", "code")
  google.searchParams.set("scope", "openid email profile")
  google.searchParams.set("state", state)
  google.searchParams.set("code_challenge", challenge)
  google.searchParams.set("code_challenge_method", "S256")
  google.searchParams.set("prompt", "select_account")

  const response = NextResponse.redirect(google)
  response.cookies.set(AUTH_COOKIES.oauth, encodeOAuthCookie({ state, verifier, callbackUrl, invite, redirectUri }), {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax", // must survive the top-level redirect back from Google
    path: "/api/auth/google",
    maxAge: AUTH_MAX_AGE.oauth,
  })
  response.headers.set("Cache-Control", "no-store")
  return response
}
