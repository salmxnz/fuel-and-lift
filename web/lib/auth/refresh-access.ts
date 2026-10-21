import { getApiEnv } from "@/config/env"
import type { AuthRefreshResponse } from "@/lib/api/types"
import { extractGoCookies } from "./set-cookie"

export type RefreshedTokens = {
  accessToken: string
  csrfToken: string
  refreshToken: string | null
}

// Refresh tokens are single use: Go rotates them on every refresh. When an
// access token expires, several requests (a navigation plus the client's
// parallel /api/v1 calls) can arrive with the same old refresh token. Only the
// first may hit Go; the rest share its result. Kept per process for a few
// seconds, which covers `next start` and `next dev` (one Node process).
const INFLIGHT_TTL_MS = 10_000
const inflight = new Map<string, { promise: Promise<RefreshedTokens | null>; at: number }>()

function sweep(now: number) {
  for (const [key, entry] of inflight) {
    if (now - entry.at > INFLIGHT_TTL_MS) inflight.delete(key)
  }
}

async function callRefresh(refreshToken: string, csrfToken: string): Promise<RefreshedTokens | null> {
  try {
    const { apiUrl } = getApiEnv()
    const res = await fetch(`${apiUrl}/v1/auth/refresh`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "X-CSRF-Token": csrfToken,
        Cookie: `refresh_token=${refreshToken}; csrf_token=${csrfToken}`,
      },
      cache: "no-store",
    })
    if (!res.ok) return null
    const json = (await res.json().catch(() => null)) as Partial<AuthRefreshResponse> | null
    if (!json?.access_token || !json.csrf_token) return null
    const go = extractGoCookies(res.headers)
    return {
      accessToken: json.access_token,
      csrfToken: json.csrf_token,
      refreshToken: go.refreshToken,
    }
  } catch {
    return null
  }
}

/**
 * POST /v1/auth/refresh replaying the stored refresh + csrf values as Go's
 * cookies plus the X-CSRF-Token double-submit header. Returns the rotated
 * tokens (access + csrf from the body, refresh from Set-Cookie) or null.
 */
export function refreshAccessToken(
  refreshToken: string,
  csrfToken: string
): Promise<RefreshedTokens | null> {
  const now = Date.now()
  sweep(now)
  const existing = inflight.get(refreshToken)
  if (existing) return existing.promise
  const promise = callRefresh(refreshToken, csrfToken)
  inflight.set(refreshToken, { promise, at: now })
  return promise
}
