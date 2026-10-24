import { NextResponse, type NextRequest } from "next/server"
import { publicUrl } from "@/lib/auth/public-origin"
import { DEFAULT_AFTER_LOGIN, safeCallbackUrl } from "@/lib/auth/callback-url"
import { AUTH_COOKIES, writeAuthCookies } from "@/lib/auth/cookies.shared"
import { resolveProxyAuth } from "@/lib/auth/proxy-auth"
import type { RefreshedTokens } from "@/lib/auth/refresh-access"

// Next 16 renamed Middleware to Proxy. Besides redirects, this is where the
// silent refresh happens: when fl_access has expired but fl_refresh is valid,
// we refresh here and write the rotated cookies onto the response (and onto
// the forwarded request), so Server Components and the /api/v1 BFF always see
// a fresh access token. Server Components can't set cookies, so they must
// never be the ones to rotate the single-use refresh token.

/** Reachable without a session. */
function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/offline" ||
    pathname.startsWith("/join/") ||
    pathname.startsWith("/api/auth/")
  )
}

/** /api/v1 endpoints Go serves without auth. */
function isPublicApi(pathname: string): boolean {
  return (
    pathname === "/api/v1/push/vapid-public-key" ||
    pathname.startsWith("/api/v1/invite-links/preview/")
  )
}

/** Replace (or add) cookies in a raw Cookie request header. */
function rewriteCookieHeader(header: string | null, updates: Record<string, string>): string {
  const jar = new Map<string, string>()
  for (const part of (header ?? "").split(";")) {
    const eq = part.indexOf("=")
    if (eq === -1) continue
    jar.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim())
  }
  for (const [name, value] of Object.entries(updates)) jar.set(name, value)
  return Array.from(jar, ([k, v]) => `${k}=${v}`).join("; ")
}

function next(request: NextRequest, refreshed: RefreshedTokens | null): NextResponse {
  if (!refreshed) return NextResponse.next()
  const updates: Record<string, string> = {
    [AUTH_COOKIES.access]: refreshed.accessToken,
    [AUTH_COOKIES.csrf]: refreshed.csrfToken,
  }
  if (refreshed.refreshToken) updates[AUTH_COOKIES.refresh] = refreshed.refreshToken
  const headers = new Headers(request.headers)
  headers.set("cookie", rewriteCookieHeader(request.headers.get("cookie"), updates))
  const response = NextResponse.next({ request: { headers } })
  writeAuthCookies(response.cookies, refreshed)
  return response
}

function withRefresh(response: NextResponse, refreshed: RefreshedTokens | null): NextResponse {
  if (refreshed) writeAuthCookies(response.cookies, refreshed)
  return response
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  // OAuth, logout and other auth plumbing manage cookies themselves.
  if (pathname.startsWith("/api/auth/")) return NextResponse.next()

  const isApi = pathname.startsWith("/api/")
  const auth = await resolveProxyAuth(request)

  if (isApi) {
    if (!auth.authenticated && !isPublicApi(pathname)) {
      return NextResponse.json({ error: { message: "Not signed in", code: "unauthorized" } }, { status: 401 })
    }
    return next(request, auth.refreshed)
  }

  // Signed in but on /login: go where they were heading.
  if (pathname === "/login" && auth.authenticated) {
    const to = safeCallbackUrl(request.nextUrl.searchParams.get("callbackUrl"))
    return withRefresh(NextResponse.redirect(publicUrl(to, request)), auth.refreshed)
  }

  // Signed in on the landing page: straight into the app.
  if (pathname === "/" && auth.authenticated) {
    return withRefresh(NextResponse.redirect(publicUrl(DEFAULT_AFTER_LOGIN, request)), auth.refreshed)
  }

  if (isPublicPath(pathname)) return next(request, auth.refreshed)

  if (!auth.authenticated) {
    const login = publicUrl("/login", request)
    const target = `${pathname}${search}`
    if (target !== "/" && target !== DEFAULT_AFTER_LOGIN) {
      login.searchParams.set("callbackUrl", safeCallbackUrl(target))
    }
    // Cookies are left alone: a failed refresh may just be Go being briefly
    // unreachable, and signing in again overwrites them anyway.
    return NextResponse.redirect(login)
  }

  return next(request, auth.refreshed)
}

export const config = {
  matcher: [
    // Everything except Next internals, the PWA files and static assets.
    "/((?!_next/static|_next/image|favicon\\.ico|icons/|manifest\\.webmanifest|sw\\.js|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|txt|xml|json|mp4|webm)$).*)",
  ],
}
