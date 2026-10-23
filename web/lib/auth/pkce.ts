// PKCE + state helpers using Web Crypto (works in route handlers and proxy).

function base64url(bytes: Uint8Array): string {
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return base64url(bytes)
}

/** RFC 7636 S256 code challenge for a verifier. */
export async function codeChallengeS256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
  return base64url(new Uint8Array(digest))
}

export type OAuthCookie = {
  state: string
  verifier: string
  callbackUrl: string
  invite: string | null
  /** The exact redirect_uri sent to Google; the code exchange must repeat it. */
  redirectUri: string | null
}

export function encodeOAuthCookie(value: OAuthCookie): string {
  return base64url(new TextEncoder().encode(JSON.stringify(value)))
}

export function decodeOAuthCookie(raw: string | undefined): OAuthCookie | null {
  if (!raw) return null
  try {
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/")
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4)
    const bin = atob(padded)
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<OAuthCookie>
    if (typeof parsed.state !== "string" || typeof parsed.verifier !== "string") return null
    return {
      state: parsed.state,
      verifier: parsed.verifier,
      callbackUrl: typeof parsed.callbackUrl === "string" ? parsed.callbackUrl : "/today",
      invite: typeof parsed.invite === "string" ? parsed.invite : null,
      redirectUri:
        typeof parsed.redirectUri === "string" && parsed.redirectUri.endsWith("/api/auth/google/callback") ? parsed.redirectUri : null,
    }
  } catch {
    return null
  }
}
