import type { Metadata } from "next"
import { ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { safeCallbackUrl } from "@/lib/auth/callback-url"

export const metadata: Metadata = { title: "Sign in" }

const ERRORS: Record<string, string> = {
  not_admin: "That Google account isn't an admin. Sign in with an admin account.",
  suspended: "That account is suspended.",
  unverified: "That Google email isn't verified yet.",
  cancelled: "Sign-in was cancelled.",
  state: "That sign-in link expired. Please try again.",
  google: "Google couldn't sign you in. Please try again.",
  unreachable: "Can't reach the API right now. Is it running?",
  server: "Something went wrong signing you in. Please try again.",
  config: "Sign-in isn't set up yet (missing GOOGLE_CLIENT_ID or JWT_SECRET in admin/.env.local).",
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined)
  const error = one("error")
  const callbackUrl = one("callbackUrl")
  const href = `/api/auth/google/start${callbackUrl ? `?callbackUrl=${encodeURIComponent(safeCallbackUrl(callbackUrl))}` : ""}`
  const message = error ? (ERRORS[error] ?? ERRORS.server) : null

  return (
    <main className="flex flex-1 items-center justify-center bg-muted/40 p-6">
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-2xl border bg-background p-8 shadow-sm">
        <div className="flex flex-col gap-2">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShieldCheck className="size-5" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">adebite admin</h1>
          <p className="text-sm text-muted-foreground">Manage users, their plans and what they share. Admins only.</p>
        </div>
        {message ? (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            {message}
          </p>
        ) : null}
        <Button asChild size="lg">
          <a href={href}>Continue with Google</a>
        </Button>
      </div>
    </main>
  )
}
