"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button, ReferralBar, Skeleton, Spinner } from "@/components/ui/primitives"
import { CloseIcon, ShareIcon } from "@/components/ui/icons"
import { api, errorMessage, seg } from "@/lib/api/client"
import type { InviteLink, InviteLinkResponse, InviteLinksResponse } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { formatDayMonth } from "@/lib/dates"
import { cn } from "@/lib/cn"

const STORE_KEY = "fl:invite-link"

function readStored(): InviteLink | null {
  try {
    const raw = sessionStorage.getItem(STORE_KEY)
    if (!raw) return null
    const link = JSON.parse(raw) as InviteLink
    return new Date(link.expires_at).getTime() > Date.now() ? link : null
  } catch {
    return null
  }
}

const STATUS: Record<InviteLink["status"], string> = {
  open: "Waiting",
  accepted: "Joined",
  revoked: "Revoked",
  expired: "Expired",
}

/** Add-Friend.dc.html as a full-screen sheet over a dimmed backdrop. */
export function AddFriendScreen() {
  const router = useRouter()
  const links = useApi<InviteLinksResponse>("invite-links")
  const [link, setLink] = useState<InviteLink | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const started = useRef(false)

  async function create() {
    setCreating(true)
    setCreateError(null)
    try {
      const res = await api.post<InviteLinkResponse>("invite-links", {})
      setLink(res.invite_link)
      try {
        sessionStorage.setItem(STORE_KEY, JSON.stringify(res.invite_link))
      } catch {
        /* private mode */
      }
      links.setData((prev) => ({
        invite_links: [res.invite_link, ...(prev?.invite_links ?? [])],
        referrals: prev?.referrals ?? { joined: 0, needed: 8 },
      }))
    } catch (err) {
      setCreateError(errorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  // Reuse this visit's open link; otherwise make one (once, StrictMode-safe).
  const listLoaded = !!links.data
  useEffect(() => {
    if (started.current || !listLoaded) return
    started.current = true
    const stored = readStored()
    const stillOpen = stored && links.data?.invite_links.some((l) => l.id === stored.id && l.status === "open")
    if (stored && stillOpen) {
      queueMicrotask(() => setLink(stored))
    } else {
      queueMicrotask(() => void create())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when the list first arrives
  }, [listLoaded])

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link.url)
      toast.success("Link copied")
    } catch {
      const el = document.getElementById("invite-url") as HTMLInputElement | null
      el?.select()
      toast("Press and hold to copy the link")
    }
  }

  async function share() {
    if (!link) return
    const data = { title: "adebite", text: "Train with me on adebite", url: link.url }
    if (navigator.share) {
      try {
        await navigator.share(data)
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return
        await copy()
      }
    } else {
      await copy()
    }
  }

  async function revoke(id: string) {
    try {
      await api.del(`invite-links/${seg(id)}`)
      links.setData((prev) => ({
        invite_links: (prev?.invite_links ?? []).map((l) => (l.id === id ? { ...l, status: "revoked" } : l)),
        referrals: prev?.referrals ?? { joined: 0, needed: 8 },
      }))
      if (link?.id === id) {
        setLink(null)
        try {
          sessionStorage.removeItem(STORE_KEY)
        } catch {
          /* ignore */
        }
      }
      toast.success("Link revoked")
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (window.history.length > 1) router.back()
        else router.push("/friends")
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [router])

  const ref = links.data?.referrals
  const sent = links.data?.invite_links ?? []
  const close = () => (window.history.length > 1 ? router.back() : router.push("/friends"))

  return (
    <div className="fixed inset-0 z-10 overflow-y-auto">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={close} className="scrim fixed inset-0 h-full w-full cursor-default" />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-friend-title"
        className="relative mx-auto mt-[12dvh] flex min-h-[88dvh] w-full max-w-[var(--app-max)] flex-col gap-4 rounded-t-sheet bg-sheet px-4 pt-2.5"
        style={{ paddingBottom: "calc(var(--safe-bottom) + 30px)" }}
      >
        <span aria-hidden="true" className="h-[5px] w-10 self-center rounded-[3px] bg-line" />
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <h1 id="add-friend-title" className="m-0 text-[26px] font-extrabold tracking-[-0.02em]">
              Add a friend
            </h1>
            <p className="m-0 text-[15px] leading-[1.45] text-muted">
              Send them this link. When they open it and sign in with Google, you&apos;re friends.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-chip"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-2.5 rounded-card bg-ink p-3.5 text-white">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-11 w-11 flex-none items-center justify-center rounded-[12px] bg-pink text-[13px] font-extrabold text-ink"
            >
              PRO
            </span>
            <div className="flex flex-1 flex-col gap-0.5">
              <span className="text-[15px] font-bold">{ref?.needed ?? 8} friends join, Pro is yours forever</span>
              <span className="text-[12px] text-night-muted">A friend counts once they finish setting up.</span>
            </div>
          </div>
          {ref ? (
            <div className="flex items-center gap-2.5">
              <span className="flex-1">
                <ReferralBar joined={ref.joined} needed={ref.needed} />
              </span>
              <span className="text-[13px] font-bold text-pink">
                {ref.joined} of {ref.needed}
              </span>
            </div>
          ) : (
            <Skeleton className="h-1.5" />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="invite-url" className="text-[13px] font-semibold text-muted">
            Your link
          </label>
          {link ? (
            <div className="flex gap-2">
              <input
                id="invite-url"
                readOnly
                value={link.url}
                onFocus={(e) => e.currentTarget.select()}
                className="min-h-12 min-w-0 flex-1 rounded-tile border border-line bg-white px-3 text-[14px]"
              />
              <Button variant="outline" size="md" onClick={copy}>
                Copy
              </Button>
            </div>
          ) : createError ? (
            <div className="flex flex-col gap-2">
              <p role="alert" className="m-0 text-[14px] font-semibold text-danger">
                {createError}
              </p>
              <Button variant="outline" size="md" onClick={create} loading={creating}>
                Try again
              </Button>
            </div>
          ) : creating || !listLoaded ? (
            <div className="flex min-h-12 items-center gap-2 rounded-tile border border-line bg-white px-3 text-[14px] text-muted" role="status">
              <Spinner size={16} /> Making your link…
            </div>
          ) : (
            <Button variant="outline" size="md" onClick={create}>
              Make a new link
            </Button>
          )}
          <span className="text-[12px] text-muted">Works once and expires in 14 days.</span>
        </div>

        <Button onClick={share} disabled={!link}>
          <ShareIcon size={18} strokeWidth={2} /> Share link
        </Button>

        <div className="flex flex-col gap-2">
          <h2 className="m-0 text-[13px] font-semibold text-muted">Links you&apos;ve sent</h2>
          {links.loading ? (
            <Skeleton className="h-12 rounded-tile" />
          ) : links.error && !links.data ? (
            <p className="m-0 text-[14px] text-danger">{links.error.message}</p>
          ) : sent.length === 0 ? (
            <div className="rounded-tile border-[1.5px] border-dashed border-dash p-3.5 text-[14px] text-muted">
              None yet. Links you share show here until someone joins.
            </div>
          ) : (
            <ul className="m-0 flex list-none flex-col rounded-tile bg-white px-3.5 py-0.5">
              {sent.map((l) => (
                <li key={l.id} className="flex min-h-[52px] items-center justify-between gap-3 border-b border-line-soft last:border-b-0">
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[14px] font-semibold">
                      {l.accepted_by ? l.accepted_by.name : `Link from ${formatDayMonth(l.created_at.slice(0, 10))}`}
                    </span>
                    <span className="text-[12px] text-muted">
                      {l.status === "open"
                        ? `Expires ${formatDayMonth(l.expires_at.slice(0, 10))}`
                        : l.status === "accepted" && l.counts_as_referral
                          ? "Joined, counts towards Pro"
                          : STATUS[l.status]}
                    </span>
                  </span>
                  {l.status === "open" ? (
                    <Button variant="danger" size="sm" onClick={() => revoke(l.id)}>
                      Revoke
                    </Button>
                  ) : (
                    <span
                      className={cn(
                        "rounded-full px-2 py-1 text-[12px] font-bold",
                        l.status === "accepted" ? "bg-pink" : "bg-chip text-muted"
                      )}
                    >
                      {STATUS[l.status]}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
