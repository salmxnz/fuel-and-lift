import type { NextRequest } from "next/server"

// Behind a reverse proxy (a self-hosted container), request.url and
// request.nextUrl describe the Next server itself, e.g. https://localhost:3000,
// not the address the browser used. Redirects built from them send people to
// localhost, and same-origin checks against them reject real requests.

function firstHeader(request: NextRequest, name: string): string | null {
  return request.headers.get(name)?.split(",")[0]?.trim() || null
}

function envOrigin(): string | null {
  const raw = process.env.APP_URL?.trim()
  if (!raw) return null
  try {
    return new URL(raw).origin
  } catch {
    return null
  }
}

/**
 * The origin the browser is on: the proxy's X-Forwarded-Host/Proto, else
 * APP_URL, else what Next sees (correct when nothing sits in front).
 */
export function publicOrigin(request: NextRequest): string {
  const host = firstHeader(request, "x-forwarded-host")
  if (host) {
    const proto = firstHeader(request, "x-forwarded-proto") ?? request.nextUrl.protocol.replace(/:$/, "")
    return `${proto}://${host}`
  }
  return envOrigin() ?? request.nextUrl.origin
}

/** An absolute URL on the browser's origin, for redirects. */
export function publicUrl(path: string, request: NextRequest): URL {
  return new URL(path, publicOrigin(request))
}

/** True when an Origin header belongs to this app (for state-changing requests). */
export function isSameOrigin(origin: string, request: NextRequest): boolean {
  return origin === publicOrigin(request) || origin === envOrigin() || origin === request.nextUrl.origin
}
