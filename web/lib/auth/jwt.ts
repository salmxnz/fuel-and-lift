import { jwtVerify } from "jose"

export type AccessClaims = { userId: string; role: string }

/**
 * Verifies the Go access token (HS256, shared JWT_SECRET) and its expiry
 * locally, so most requests need no round trip. Returns null when invalid.
 */
export async function verifyAccessToken(
  token: string,
  secret: string
): Promise<AccessClaims | null> {
  if (!token || !secret) return null
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
    })
    const userId = typeof payload.user_id === "string" ? payload.user_id : payload.sub
    if (!userId) return null
    return { userId, role: typeof payload.role === "string" ? payload.role : "member" }
  } catch {
    return null
  }
}
