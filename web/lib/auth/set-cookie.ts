// Parses "name=value; Path=/; HttpOnly" into { name, value }.
export function parseSetCookie(header: string): { name: string; value: string } | null {
  const [pair] = header.split(";")
  if (!pair) return null
  const eq = pair.indexOf("=")
  if (eq === -1) return null
  return { name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim() }
}

/**
 * Pulls Go's refresh_token / csrf_token out of a response's Set-Cookie headers
 * so Next can re-store them as its own fl_* cookies. Go only ever delivers the
 * refresh token through Set-Cookie, never in a body.
 */
export function extractGoCookies(headers: Headers): {
  refreshToken: string | null
  csrfToken: string | null
} {
  let refreshToken: string | null = null
  let csrfToken: string | null = null
  const all =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : ([headers.get("set-cookie")].filter(Boolean) as string[])
  for (const raw of all) {
    const parsed = parseSetCookie(raw)
    if (!parsed || !parsed.value) continue
    if (parsed.name === "refresh_token") refreshToken = parsed.value
    if (parsed.name === "csrf_token") csrfToken = parsed.value
  }
  return { refreshToken, csrfToken }
}
