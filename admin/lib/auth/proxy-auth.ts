import type { NextRequest } from "next/server"
import { getApiEnv } from "@/config/env"
import { clientIp } from "./public-origin"
import { AUTH_COOKIES } from "./cookies.shared"
import { verifyAccessToken, type AccessClaims } from "./jwt"
import { refreshAccessToken, type RefreshedTokens } from "./refresh-access"

export type ProxyAuth = {
  /** The signed-in person, null when signed out. */
  claims: AccessClaims | null
  /** Set when the proxy refreshed: the caller must persist these cookies. */
  refreshed: RefreshedTokens | null
}

function secret(): string {
  try {
    return getApiEnv().jwtSecret
  } catch {
    return ""
  }
}

/**
 * A valid fla_access passes immediately. Otherwise, when fla_refresh + fla_csrf
 * exist, refresh silently. The caller writes `refreshed` onto the response so
 * the rotated single-use refresh token is never lost.
 */
export async function resolveProxyAuth(request: NextRequest): Promise<ProxyAuth> {
  const access = request.cookies.get(AUTH_COOKIES.access)?.value
  const refresh = request.cookies.get(AUTH_COOKIES.refresh)?.value
  const csrf = request.cookies.get(AUTH_COOKIES.csrf)?.value
  const key = secret()

  const current = access ? await verifyAccessToken(access, key) : null
  if (current) return { claims: current, refreshed: null }
  if (!refresh || !csrf) return { claims: null, refreshed: null }

  const refreshed = await refreshAccessToken(refresh, csrf, clientIp(request))
  const claims = refreshed ? await verifyAccessToken(refreshed.accessToken, key) : null
  if (!claims) return { claims: null, refreshed: null }
  return { claims, refreshed }
}
