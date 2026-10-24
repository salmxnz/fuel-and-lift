import { NextResponse, type NextRequest } from "next/server"
import { isSameOrigin, publicUrl } from "@/lib/auth/public-origin"
import { getApiEnv } from "@/config/env"
import { AUTH_COOKIES, clearAuthCookies } from "@/lib/auth/cookies.shared"

export const dynamic = "force-dynamic"

// POST /api/auth/logout → Go revokes the refresh token (best effort), then we
// clear every fla_* cookie regardless and land on /login.
export async function POST(request: NextRequest) {
  const refresh = request.cookies.get(AUTH_COOKIES.refresh)?.value
  const csrf = request.cookies.get(AUTH_COOKIES.csrf)?.value

  // Same-origin check: logout is state-changing, so refuse cross-site posts.
  const origin = request.headers.get("origin")
  if (origin && !isSameOrigin(origin, request)) {
    return NextResponse.json({ error: { message: "Bad origin" } }, { status: 403 })
  }

  if (refresh && csrf) {
    try {
      const { apiUrl } = getApiEnv()
      await fetch(`${apiUrl}/v1/auth/logout`, {
        method: "POST",
        headers: { "X-CSRF-Token": csrf, Cookie: `refresh_token=${refresh}; csrf_token=${csrf}` },
        cache: "no-store",
      })
    } catch {
      // Clear locally even if Go is unreachable.
    }
  }

  const response = NextResponse.redirect(publicUrl("/login", request), 303)
  clearAuthCookies(response.cookies)
  response.headers.set("Cache-Control", "no-store")
  return response
}
