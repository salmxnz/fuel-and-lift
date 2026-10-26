// Typed browser client for the BFF (/api/v1/* → Go /v1/*). Tokens live in
// httpOnly cookies, so requests are plain same-origin fetches.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string | null = null
  ) {
    super(message)
    this.name = "ApiError"
  }
}

type Query = Record<string, string | number | boolean | null | undefined>

const FRIENDLY: Record<number, string> = {
  401: "You're signed out. Sign in again.",
  403: "Admins only.",
  404: "Not found.",
  429: "Too many requests. Wait a moment and try again.",
  502: "The server had a problem. Try again.",
  503: "That isn't available right now.",
}

function buildUrl(path: string, query?: Query): string {
  const url = `/api/v1/${path.replace(/^\/+/, "")}`
  if (!query) return url
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue
    params.set(k, String(v))
  }
  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}

async function request<T>(method: string, path: string, opts: { query?: Query; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method,
      headers: {
        Accept: "application/json",
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      signal: opts.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err
    throw new ApiError(0, "You seem to be offline. Check your connection.", "network")
  }

  if (res.status === 204) return undefined as T

  const json = (await res.json().catch(() => null)) as unknown
  if (!res.ok) {
    const err = (json as { error?: { message?: string; code?: string } } | null)?.error
    const message = err?.message ? capitalize(err.message) : (FRIENDLY[res.status] ?? `Request failed (${res.status})`)
    if (res.status === 401 && typeof window !== "undefined") onUnauthorized()
    throw new ApiError(res.status, message, err?.code ?? null)
  }
  return json as T
}

function capitalize(s: string): string {
  const t = s.trim()
  return t ? t[0].toUpperCase() + t.slice(1) : t
}

let redirecting = false
function onUnauthorized() {
  if (redirecting) return
  redirecting = true
  const here = `${window.location.pathname}${window.location.search}`
  window.location.assign(`/login?callbackUrl=${encodeURIComponent(here)}`)
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>("GET", path, { query, signal }),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, { body: body ?? {} }),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, { body: body ?? {} }),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, { body: body ?? {} }),
  del: <T = void>(path: string) => request<T>("DELETE", path),
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return "Something went wrong."
}

/** Encode one path segment (an id or a date) for use in api paths. */
export const seg = (value: string) => encodeURIComponent(value)
