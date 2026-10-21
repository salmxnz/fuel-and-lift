import type { Metadata } from "next"
import Link from "next/link"
import { GoogleButton, NightShell, Tick } from "@/components/auth/night-shell"
import { AcceptInvite } from "@/components/auth/accept-invite"
import type { InvitePreviewResponse } from "@/lib/api/types"
import { GoApiError, goFetch } from "@/lib/auth/go-client"
import { getSession } from "@/lib/auth/session"

export const metadata: Metadata = { title: "You're invited" }
export const dynamic = "force-dynamic"

const TOKEN_RE = /^[A-Za-z0-9_-]{4,200}$/

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const session = await getSession()

  let preview: InvitePreviewResponse | null = null
  let failure: "invalid" | "down" | null = null
  if (!TOKEN_RE.test(token)) {
    failure = "invalid"
  } else {
    try {
      const { data } = await goFetch<InvitePreviewResponse>(`/invite-links/preview/${encodeURIComponent(token)}`)
      preview = data
      if (!data.valid) failure = "invalid"
    } catch (err) {
      failure = err instanceof GoApiError && (err.status === 404 || err.status === 400) ? "invalid" : "down"
    }
  }

  const inviter = preview?.inviter.name?.trim() || "A friend"
  const first = inviter.split(/\s+/)[0]

  if (failure) {
    return (
      <NightShell>
        <div className="flex flex-col gap-2.5">
          <h1 className="m-0 text-[34px] font-extrabold leading-[1.05] tracking-[-0.03em]">
            {failure === "down" ? "Can't check this link right now" : "This link doesn't work any more"}
          </h1>
          <p className="m-0 text-[16px] leading-[1.45] text-night-soft">
            {failure === "down"
              ? "The server isn't answering. Try opening the link again in a moment."
              : `Friend links work once and expire after 14 days. Ask ${preview ? first : "your friend"} to send a new one.`}
          </p>
        </div>
        <div className="flex-1" />
        <Link
          href={session ? "/today" : "/login"}
          className="flex min-h-14 items-center justify-center rounded-btn border border-night-line text-[16px] font-bold text-ink no-underline"
        >
          {session ? "Go to Today" : "Sign in"}
        </Link>
      </NightShell>
    )
  }

  return (
    <NightShell>
      <div className="flex items-center">
        {preview?.inviter.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- Google avatar
          <img
            src={preview.inviter.avatar_url}
            alt=""
            width={72}
            height={72}
            referrerPolicy="no-referrer"
            className="h-[72px] w-[72px] rounded-full border-[3px] border-night object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-[3px] border-night bg-white text-[30px] font-extrabold text-ink"
          >
            {first[0]?.toUpperCase()}
          </span>
        )}
        <span
          aria-hidden="true"
          className="-ml-4 flex h-[72px] w-[72px] items-center justify-center rounded-full border-[3px] border-night bg-night-2 text-night-muted"
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="8.5" r="3.5" />
            <path d="M5 20c1.3-3.6 4-5.5 7-5.5s5.7 1.9 7 5.5" />
          </svg>
        </span>
      </div>
      <div className="flex flex-col gap-2.5">
        <h1 className="m-0 text-[38px] font-extrabold leading-[1.02] tracking-[-0.03em]">{first} wants you to train together</h1>
        <p className="m-0 text-[16px] leading-[1.45] text-night-soft">
          Log meals from a photo, follow your gym plan, and see when each other works out.
        </p>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2.5 rounded-card border border-night-3 p-3.5 text-[14px] text-night-soft">
        <li className="flex items-center gap-2.5">
          <Tick /> Free to join, 10 photo estimates a month
        </li>
        <li className="flex items-center gap-2.5">
          <Tick /> You choose what {first} can see
        </li>
        <li className="flex items-center gap-2.5">
          <Tick /> Invite 8 friends yourself and get Pro forever
        </li>
      </ul>
      <div className="flex-1" />
      <div className="flex flex-col gap-2.5">
        {session ? (
          <AcceptInvite token={token} inviter={first} />
        ) : (
          <GoogleButton href={`/api/auth/google/start?invite=${encodeURIComponent(token)}`} />
        )}
        <p className="m-0 text-center text-[12px] leading-[1.45] text-night-muted">
          This link works once. You&apos;ll be friends with {first} as soon as you {session ? "accept" : "sign in"}.
        </p>
      </div>
    </NightShell>
  )
}
