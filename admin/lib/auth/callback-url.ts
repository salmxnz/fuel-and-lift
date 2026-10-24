export const DEFAULT_AFTER_LOGIN = "/users"

/**
 * Only same-origin relative paths are allowed as a post-login destination
 * ("/users?q=…"), never "//evil.com" or an absolute URL.
 */
export function safeCallbackUrl(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_AFTER_LOGIN
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return DEFAULT_AFTER_LOGIN
  if (raw.startsWith("/api/") || raw === "/login" || raw.startsWith("/login?")) return DEFAULT_AFTER_LOGIN
  return raw
}
