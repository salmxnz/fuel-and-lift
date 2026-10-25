import { NextResponse, type NextRequest } from "next/server"
import { clientIp, isSameOrigin } from "@/lib/auth/public-origin"
import { getApiEnv } from "@/config/env"
import { AUTH_COOKIES } from "@/lib/auth/cookies.shared"

export const dynamic = "force-dynamic"

// BFF pass-through: /api/v1/<path>?<query> → ${API_URL}/v1/<path>?<query>.
//
// - Adds `Authorization: Bearer <fl_access>` from the httpOnly cookie, so the
//   browser's JavaScript never holds a token.
// - Sends only a JSON body and a fixed header set: incoming cookies and any
//   other client headers are dropped.
// - Only ever talks to API_URL's origin; path segments are validated and
//   re-encoded so nothing can climb out of /v1.
// proxy.ts has already refreshed an expired access token by the time this runs.

type Ctx = { params: Promise<{ path: string[] }> }

const MAX_BODY_BYTES = 4 * 1024 * 1024 // AI photo estimates carry ~1 MB of base64
const SEGMENT_RE = /^[A-Za-z0-9._~-]+$/

function jsonError(status: number, message: string, code?: string) {
  return NextResponse.json({ error: { message, ...(code ? { code } : {}) } }, { status })
}

function buildTarget(segments: string[], search: string): URL | null {
  const { apiUrl, apiOrigin } = getApiEnv()
  if (segments.length === 0) return null
  for (const segment of segments) {
    if (!segment || segment === "." || segment === ".." || segment.includes("..")) return null
    if (!SEGMENT_RE.test(segment)) return null
  }
  const path = segments.map(encodeURIComponent).join("/")
  const base = new URL(`${apiUrl}/`)
  const target = new URL(`v1/${path}`, base)
  if (target.origin !== apiOrigin) return null
  const basePath = base.pathname.replace(/\/$/, "")
  if (!target.pathname.startsWith(`${basePath}/v1/`)) return null
  target.search = search
  return target
}

async function forward(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const method = request.method.toUpperCase()

  // State-changing requests must come from our own pages.
  if (method !== "GET") {
    const origin = request.headers.get("origin")
    if (origin && !isSameOrigin(origin, request)) {
      return jsonError(403, "Cross-site request blocked")
    }
  }

  const { path } = await ctx.params
  let target: URL | null
  try {
    target = buildTarget(path ?? [], request.nextUrl.search)
  } catch {
    return jsonError(500, "The app is not configured (API_URL / JWT_SECRET).", "config")
  }
  if (!target) return jsonError(400, "Invalid API path")

  const headers: Record<string, string> = { Accept: "application/json" }
  const access = request.cookies.get(AUTH_COOKIES.access)?.value
  if (access) headers.Authorization = `Bearer ${access}`
  const ua = request.headers.get("user-agent")
  if (ua) headers["User-Agent"] = ua
  const ip = clientIp(request)
  if (ip) headers["X-Client-IP"] = ip

  let body: string | undefined
  if (method !== "GET" && method !== "DELETE") {
    const length = Number(request.headers.get("content-length") ?? "0")
    if (length > MAX_BODY_BYTES) return jsonError(413, "That's too big to send. Try a smaller photo.")
    const text = await request.text()
    if (text.length > MAX_BODY_BYTES) return jsonError(413, "That's too big to send. Try a smaller photo.")
    if (text) {
      try {
        JSON.parse(text)
      } catch {
        return jsonError(400, "Body must be JSON")
      }
      body = text
      headers["Content-Type"] = "application/json"
    }
  } else if (method === "DELETE") {
    // DELETE /v1/push/subscriptions takes a JSON body.
    const text = await request.text()
    if (text) {
      try {
        JSON.parse(text)
      } catch {
        return jsonError(400, "Body must be JSON")
      }
      body = text
      headers["Content-Type"] = "application/json"
    }
  }

  let upstream: Response
  try {
    upstream = await fetch(target, {
      method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
    })
  } catch {
    return jsonError(502, "Can't reach the server. Try again in a moment.", "unreachable")
  }

  if (upstream.status >= 300 && upstream.status < 400) {
    return jsonError(502, "Unexpected redirect from the API")
  }

  if (upstream.status === 204 || upstream.status === 205) {
    return new NextResponse(null, { status: upstream.status, headers: { "Cache-Control": "no-store" } })
  }

  const text = await upstream.text()
  let payload: string = text
  try {
    if (text) JSON.parse(text)
    else payload = upstream.ok ? "{}" : JSON.stringify({ error: { message: `Request failed (${upstream.status})` } })
  } catch {
    payload = JSON.stringify(
      upstream.ok ? {} : { error: { message: `Request failed (${upstream.status})` } }
    )
  }

  return new NextResponse(payload, {
    status: upstream.status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  })
}

export const GET = forward
export const POST = forward
export const PUT = forward
export const PATCH = forward
export const DELETE = forward
