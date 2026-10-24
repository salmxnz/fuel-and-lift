import { NextResponse, type NextRequest } from "next/server"
import { publicUrl } from "@/lib/auth/public-origin"
import { DEFAULT_AFTER_LOGIN, safeCallbackUrl } from "@/lib/auth/callback-url"
import { AUTH_COOKIES, writeAuthCookies } from "@/lib/auth/cookies.shared"
import { resolveProxyAuth } from "@/lib/auth/proxy-auth"
import type { RefreshedTokens } from "@/lib/auth/refresh-access"

// Next 16's Proxy (formerly Middleware). As in web/proxy.ts this is where the
// silent refresh happens, so pages and the /api/v1 BFF always see a fresh
// access token. On top of that, only admins get past it: a signed-in member
// (say, demoted since signing in) lands on /forbidden. Go checks the role on
// every admin call anyway.

/** Reachable without a session. */
function isPublicPath(pathname: string): boolean {
  return pathname === "/login" || pathname === "/forbidden" || pathname.startsWith("/api/auth/")
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

  // OAuth and logout manage cookies themselves.
  if (pathname.startsWith("/api/auth/")) return NextResponse.next()

  const auth = await resolveProxyAuth(request)
  const isAdmin = auth.claims?.role === "admin"

  if (pathname.startsWith("/api/")) {
    if (!auth.claims) {
      return NextResponse.json({ error: { message: "Not signed in", code: "unauthorized" } }, { status: 401 })
    }
    if (!isAdmin) {
      return withRefresh(
        NextResponse.json({ error: { message: "Admins only", code: "forbidden" } }, { status: 403 }),
        auth.refreshed
      )
    }
    return next(request, auth.refreshed)
  }

  if (pathname === "/login" && isAdmin) {
    const to = safeCallbackUrl(request.nextUrl.searchParams.get("callbackUrl"))
    return withRefresh(NextResponse.redirect(publicUrl(to, request)), auth.refreshed)
  }
  if (pathname === "/") {
    const to = isAdmin ? DEFAULT_AFTER_LOGIN : "/login"
    return withRefresh(NextResponse.redirect(publicUrl(to, request)), auth.refreshed)
  }
  if (isPublicPath(pathname)) return next(request, auth.refreshed)

  if (!auth.claims) {
    const login = publicUrl("/login", request)
    const target = `${pathname}${search}`
    if (target !== DEFAULT_AFTER_LOGIN) login.searchParams.set("callbackUrl", safeCallbackUrl(target))
    return NextResponse.redirect(login)
  }
  if (!isAdmin) return withRefresh(NextResponse.redirect(publicUrl("/forbidden", request)), auth.refreshed)

  return next(request, auth.refreshed)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|txt)$).*)"],
}
