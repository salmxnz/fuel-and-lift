import type { Metadata } from "next"
import { GoogleButton, NightShell, Tick } from "@/components/auth/night-shell"
import { safeCallbackUrl } from "@/lib/auth/callback-url"

export const metadata: Metadata = { title: "Sign in" }

const ERRORS: Record<string, string> = {
  invite_only: "This app is invite-only. Ask a friend for a link.",
  cancelled: "Sign-in was cancelled. Try again when you're ready.",
  state: "That sign-in link expired. Please try again.",
  google: "Google couldn't sign you in. Please try again.",
  unreachable: "Can't reach the server right now. Try again in a moment.",
  server: "Something went wrong signing you in. Please try again.",
  config: "Sign-in isn't set up on this server yet (missing GOOGLE_CLIENT_ID or JWT_SECRET).",
  session: "Your session ended. Sign in again.",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined)
  const error = one("error")
  const invite = one("invite")
  const callbackUrl = one("callbackUrl")

  const start = new URLSearchParams()
  if (invite && /^[A-Za-z0-9_-]{4,200}$/.test(invite)) start.set("invite", invite)
  if (callbackUrl) start.set("callbackUrl", safeCallbackUrl(callbackUrl))
  const href = `/api/auth/google/start${start.size ? `?${start.toString()}` : ""}`
  const message = error ? (ERRORS[error] ?? ERRORS.server) : null

  return (
    <NightShell>
      <div className="flex flex-col gap-2.5">
        <h1 className="m-0 text-[38px] font-extrabold leading-[1.02] tracking-[-0.03em]">Eat, lift, and see it add up.</h1>
        <p className="m-0 text-[16px] leading-[1.45] text-night-soft">
          Log meals from a photo, follow your gym plan, and train alongside a few friends.
        </p>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2.5 rounded-card border border-night-3 p-3.5 text-[14px] text-night-soft">
        <li className="flex items-center gap-2.5">
          <Tick /> Photo calorie estimates you can check
        </li>
        <li className="flex items-center gap-2.5">
          <Tick /> Workout plans that move up when you do
        </li>
        <li className="flex items-center gap-2.5">
          <Tick /> Private: invite-only, you choose what friends see
        </li>
      </ul>
      <div className="flex-1" />
      {message ? (
        <p role="alert" className="m-0 rounded-tile bg-night-2 px-3.5 py-3 text-[14px] leading-[1.45] text-ink">
          {message}
        </p>
      ) : null}
      <div className="flex flex-col gap-2.5">
        <GoogleButton href={href} />
        <p className="m-0 text-center text-[12px] leading-[1.45] text-night-muted">
          Invite-only. New here? Open the link a friend sent you.
        </p>
      </div>
    </NightShell>
  )
}
