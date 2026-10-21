import "server-only"
import { getApiEnv } from "@/config/env"

export class GoApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string | null
  ) {
    super(message)
    this.name = "GoApiError"
  }
}

type GoFetchOptions = {
  method?: string
  body?: unknown
  accessToken?: string | null
}

/**
 * Server-only client for the Go API (`${API_URL}/v1`). Returns the parsed body
 * and the raw headers (auth callers need Go's Set-Cookie). Throws GoApiError
 * with Go's `{error:{message, code?}}` on a non-2xx status.
 */
export async function goFetch<T>(
  path: string,
  options: GoFetchOptions = {}
): Promise<{ data: T; headers: Headers; status: number }> {
  const { apiUrl } = getApiEnv()
  const headers: Record<string, string> = { Accept: "application/json" }
  if (options.body !== undefined) headers["Content-Type"] = "application/json"
  if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`

  let res: Response
  try {
    res = await fetch(`${apiUrl}/v1${path}`, {
      method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    })
  } catch {
    throw new GoApiError("Can't reach the server. Try again in a moment.", 503, "unreachable")
  }

  if (res.status === 204) return { data: undefined as T, headers: res.headers, status: 204 }

  const json = (await res.json().catch(() => null)) as unknown
  if (!res.ok) {
    const err = (json as { error?: { message?: string; code?: string } } | null)?.error
    throw new GoApiError(err?.message ?? `Request failed (${res.status})`, res.status, err?.code ?? null)
  }
  return { data: json as T, headers: res.headers, status: res.status }
}
