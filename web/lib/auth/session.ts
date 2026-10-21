import "server-only"
import { cache } from "react"
import { cookies } from "next/headers"
import { getApiEnv } from "@/config/env"
import type { MeResponse } from "@/lib/api/types"
import { AUTH_COOKIES } from "./cookies.shared"
import { GoApiError, goFetch } from "./go-client"
import { verifyAccessToken } from "./jwt"

export type Session = {
  userId: string
  role: string
  accessToken: string
}

/**
 * Resolves the signed-in session for Server Components and route handlers.
 * proxy.ts refreshes an expired access token before any page renders, so here
 * a valid fl_access is all we need: Server Components can't write cookies, so
 * this never rotates the refresh token itself.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const store = await cookies()
  const accessToken = store.get(AUTH_COOKIES.access)?.value
  if (!accessToken) return null
  let secret = ""
  try {
    secret = getApiEnv().jwtSecret
  } catch {
    return null
  }
  const claims = await verifyAccessToken(accessToken, secret)
  if (!claims) return null
  return { userId: claims.userId, role: claims.role, accessToken }
})

/** GET /v1/auth/me for the current session (deduped per request). */
export const getMe = cache(async (): Promise<MeResponse | null> => {
  const session = await getSession()
  if (!session) return null
  try {
    const { data } = await goFetch<MeResponse>("/auth/me", { accessToken: session.accessToken })
    return data
  } catch (err) {
    if (err instanceof GoApiError && err.status === 401) return null
    throw err
  }
})
