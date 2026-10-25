import type { NextRequest } from "next/server"
import { getApiEnv } from "@/config/env"
import { clientIp } from "./public-origin"
import { AUTH_COOKIES } from "./cookies.shared"
import { verifyAccessToken } from "./jwt"
import { refreshAccessToken, type RefreshedTokens } from "./refresh-access"

export type ProxyAuth = {
  authenticated: boolean
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
 * A valid fl_access passes immediately. Otherwise, when fl_refresh + fl_csrf
 * exist, refresh silently. The caller writes `refreshed` onto the response so
 * the rotated single-use refresh token is never lost.
 */
export async function resolveProxyAuth(request: NextRequest): Promise<ProxyAuth> {
  const access = request.cookies.get(AUTH_COOKIES.access)?.value
  const refresh = request.cookies.get(AUTH_COOKIES.refresh)?.value
  const csrf = request.cookies.get(AUTH_COOKIES.csrf)?.value
  const key = secret()

  if (access && (await verifyAccessToken(access, key))) {
    return { authenticated: true, refreshed: null }
  }
  if (!refresh || !csrf) return { authenticated: false, refreshed: null }

  const refreshed = await refreshAccessToken(refresh, csrf, clientIp(request))
  if (!refreshed || !(await verifyAccessToken(refreshed.accessToken, key))) {
    return { authenticated: false, refreshed: null }
  }
  return { authenticated: true, refreshed }
}
