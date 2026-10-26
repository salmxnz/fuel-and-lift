import { NextResponse, type NextRequest } from "next/server"
import { getApiEnv } from "@/config/env"

export const dynamic = "force-dynamic"

// POST /api/stripe/webhook → ${API_URL}/v1/billing/webhook.
//
// Stripe calls this, not the browser, so there's no session: Go checks the
// Stripe-Signature over the exact bytes, which is why the body is forwarded
// untouched (the /api/v1 BFF re-checks JSON and drops headers). Go's status
// goes back as is, so a failure makes Stripe retry.

const MAX_BODY_BYTES = 1024 * 1024

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature")
  if (!signature) return NextResponse.json({ error: { message: "Missing signature" } }, { status: 400 })
  const length = Number(request.headers.get("content-length") ?? "0")
  if (length > MAX_BODY_BYTES) return NextResponse.json({ error: { message: "Too large" } }, { status: 413 })
  const body = await request.text()
  if (body.length > MAX_BODY_BYTES) return NextResponse.json({ error: { message: "Too large" } }, { status: 413 })

  let upstream: Response
  try {
    const { apiUrl } = getApiEnv()
    upstream = await fetch(`${apiUrl}/v1/billing/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Stripe-Signature": signature },
      body,
      cache: "no-store",
      redirect: "manual",
    })
  } catch {
    return NextResponse.json({ error: { message: "API unreachable" } }, { status: 502 })
  }
  return new NextResponse(await upstream.text(), {
    status: upstream.status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  })
}
