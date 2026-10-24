import { NextResponse, type NextRequest } from "next/server"
import { getApiEnv } from "@/config/env"

// Profile photos people upload: /avatars/<user id>?v=<version> → Go's
// GET /v1/avatars/<user id>. Public (no session) so the admin app and emails
// can show them too; the ?v= in the URL changes with every new photo, so the
// response is cached for good.

export const dynamic = "force-dynamic"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return new NextResponse(null, { status: 404 })

  let upstream: Response
  try {
    const { apiUrl } = getApiEnv()
    upstream = await fetch(`${apiUrl}/v1/avatars/${id}`, { cache: "no-store", redirect: "manual" })
  } catch {
    return new NextResponse(null, { status: 502 })
  }
  const type = upstream.headers.get("content-type") ?? ""
  if (!upstream.ok || !IMAGE_TYPES.has(type)) {
    return new NextResponse(null, { status: upstream.status === 404 ? 404 : 502, headers: { "Cache-Control": "no-store" } })
  }
  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  })
}
