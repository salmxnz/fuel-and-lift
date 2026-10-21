// Server-only configuration, validated on first use.
//
// None of these have a NEXT_PUBLIC_ prefix, so they never reach the browser:
// only route handlers, the proxy and Server Components read them. Validation is
// lazy (on first call, not at import) so `next build` works without a .env.

export type ServerEnv = {
  /** Go API base, e.g. http://localhost:8080 (no trailing slash, no /v1). */
  apiUrl: string
  /** Origin of apiUrl, used to make sure the BFF never forwards elsewhere. */
  apiOrigin: string
  /** Public URL of this app, e.g. http://localhost:3000. */
  appUrl: string
  /** Google OAuth web client id (same as the Go API's GOOGLE_CLIENT_ID). */
  googleClientId: string
  /** HS256 secret shared with Go, used only to verify access tokens. */
  jwtSecret: string
}

export class EnvError extends Error {
  constructor(message: string) {
    super(`[env] ${message}`)
    this.name = "EnvError"
  }
}

function readUrl(name: string, fallback: string): string {
  const raw = process.env[name]?.trim() || fallback
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new EnvError(`${name} must be an absolute URL, got "${raw}"`)
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new EnvError(`${name} must use http or https, got "${parsed.protocol}"`)
  }
  if (parsed.search || parsed.hash) {
    throw new EnvError(`${name} must not contain a query string or fragment`)
  }
  return raw.replace(/\/+$/, "")
}

function readRequired(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new EnvError(`${name} is required. See web/.env.example.`)
  }
  return value
}

let cached: ServerEnv | null = null

/** Full validated environment. Throws EnvError with a helpful message. */
export function getEnv(): ServerEnv {
  if (cached) return cached
  const apiUrl = readUrl("API_URL", "http://localhost:8080")
  const appUrl = readUrl("APP_URL", "http://localhost:3000")
  const googleClientId = readRequired("GOOGLE_CLIENT_ID")
  const jwtSecret = readRequired("JWT_SECRET")
  cached = {
    apiUrl,
    apiOrigin: new URL(apiUrl).origin,
    appUrl,
    googleClientId,
    jwtSecret,
  }
  return cached
}

/**
 * The subset needed to talk to Go (proxy refresh, BFF, server fetches). Does
 * not require GOOGLE_CLIENT_ID, so a misconfigured OAuth client only breaks
 * sign-in, not an already signed-in session.
 */
export function getApiEnv(): Pick<ServerEnv, "apiUrl" | "apiOrigin" | "jwtSecret"> {
  if (cached) return cached
  const apiUrl = readUrl("API_URL", "http://localhost:8080")
  return {
    apiUrl,
    apiOrigin: new URL(apiUrl).origin,
    jwtSecret: readRequired("JWT_SECRET"),
  }
}
