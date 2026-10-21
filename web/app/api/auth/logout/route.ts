import { NextResponse, type NextRequest } from "next/server"
import { getApiEnv } from "@/config/env"
import { AUTH_COOKIES, clearAuthCookies } from "@/lib/auth/cookies.shared"

export const dynamic = "force-dynamic"

// POST /api/auth/logout → Go revokes the refresh token (best effort), then we
// clear every fl_* cookie regardless. Responds JSON for fetch() callers, or a
// redirect to /login for a plain form post.
export async function POST(request: NextRequest) {
  const refresh = request.cookies.get(AUTH_COOKIES.refresh)?.value
  const csrf = request.cookies.get(AUTH_COOKIES.csrf)?.value

  // Same-origin check: logout is state-changing, so refuse cross-site posts.
  const origin = request.headers.get("origin")
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: { message: "Bad origin" } }, { status: 403 })
  }

  if (refresh && csrf) {
    try {
      const { apiUrl } = getApiEnv()
      await fetch(`${apiUrl}/v1/auth/logout`, {
        method: "POST",
        headers: {
          "X-CSRF-Token": csrf,
          Cookie: `refresh_token=${refresh}; csrf_token=${csrf}`,
        },
        cache: "no-store",
      })
    } catch {
      // Clear locally even if Go is unreachable.
    }
  }

  const wantsJson = request.headers.get("accept")?.includes("application/json")
  const response = wantsJson
    ? NextResponse.json({ ok: true })
    : NextResponse.redirect(new URL("/login", request.url), 303)
  clearAuthCookies(response.cookies)
  response.headers.set("Cache-Control", "no-store")
  return response
}

// GET is only used by server layouts when Go rejects a token that still looks
// valid locally: clear cookies and land on /login with a gentle message. A
// cross-site GET can at worst sign someone out, so no Go call is made here
// and the refresh token simply expires.
export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login?error=session", request.url))
  clearAuthCookies(response.cookies)
  response.headers.set("Cache-Control", "no-store")
  return response
}
