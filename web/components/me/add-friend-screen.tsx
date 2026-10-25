"use client"

// Add a friend: every Copy or Share hands out a brand-new single-use link, so
// you can invite a few people in a row. Links still waiting for someone can be
// copied again or revoked.
//
// Safari only lets a tap copy or open the share sheet if nothing is awaited
// first, so one fresh link is always made ahead ("ready") and handed out
// instantly; the next one is made right after.

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button, ReferralBar, Skeleton } from "@/components/ui/primitives"
import { CheckIcon, CloseIcon, ShareIcon } from "@/components/ui/icons"
import { api, ApiError, errorMessage, seg } from "@/lib/api/client"
import type { InviteLink, InviteLinkResponse, InviteLinksResponse } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { formatDayMonth } from "@/lib/dates"
import { cn } from "@/lib/cn"

/** Links this device has handed out, so the ready one is never reused. */
const SENT_KEY = "fl:invite-sent"

function readSent(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SENT_KEY) ?? "[]") as string[])
  } catch {
    return new Set()
  }
}
function markSent(id: string) {
  try {
    const s = readSent()
    s.add(id)
    localStorage.setItem(SENT_KEY, JSON.stringify([...s].slice(-60)))
  } catch {
    /* private mode */
  }
}

const STATUS: Record<InviteLink["status"], string> = {
  open: "Waiting",
  accepted: "Joined",
  revoked: "Revoked",
  expired: "Expired",
}

/** "11:52" today, else "24 Oct, 11:52". */
function madeAt(iso: string): string {
  const d = new Date(iso)
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  return d.toDateString() === new Date().toDateString() ? time : `${formatDayMonth(iso.slice(0, 10))}, ${time}`
}

/** Copy text right away, inside the tap (works in Safari too). */
function copyNow(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text)
  return Promise.reject(new Error("no clipboard"))
}

export function AddFriendScreen() {
  const router = useRouter()
  const links = useApi<InviteLinksResponse>("invite-links")
  const [ready, setReady] = useState<InviteLink | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [limitHit, setLimitHit] = useState<string | null>(null)
  const [sent, setSent] = useState<Set<string>>(() => new Set())
  const [justCopied, setJustCopied] = useState<string | null>(null)
  const started = useRef(false)

  const prepare = useCallback(async () => {
    setPreparing(true)
    try {
      const res = await api.post<InviteLinkResponse>("invite-links", {})
      setReady(res.invite_link)
      setLimitHit(null)
      links.setData((prev) => ({
        invite_links: [res.invite_link, ...(prev?.invite_links ?? [])],
        referrals: prev?.referrals ?? { joined: 0, needed: 8 },
      }))
    } catch (err) {
      if (err instanceof ApiError && err.code === "too_many_links") setLimitHit(err.message)
      else toast.error(errorMessage(err))
    } finally {
      setPreparing(false)
    }
  }, [links])

  // Once the list is in: reuse an open link this device never handed out, else make one.
  const listLoaded = !!links.data
  useEffect(() => {
    if (started.current || !listLoaded) return
    started.current = true
    const s = readSent()
    const spare = links.data?.invite_links.find((l) => l.status === "open" && l.url && !s.has(l.id))
    queueMicrotask(() => {
      setSent(s)
      if (spare) setReady(spare)
      else void prepare()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the list first arrives
  }, [listLoaded])

  function handOut(link: InviteLink) {
    markSent(link.id)
    setSent((prev) => new Set(prev).add(link.id))
    setReady(null)
    void prepare()
  }

  function copyNew() {
    if (!ready?.url) return
    const link = ready
    copyNow(link.url!)
      .then(() => {
        toast.success("New link copied. It works for one friend.")
        flash(link.id)
      })
      .catch(() => toast(`Copy this link: ${link.url}`))
    handOut(link)
  }

  function shareNew() {
    if (!ready?.url) return
    const link = ready
    const data = { title: "adebite", text: "Come train with me on adebite", url: link.url! }
    if (navigator.share) {
      navigator.share(data).then(
        () => handOut(link),
        (err) => {
          if (err instanceof DOMException && err.name === "AbortError") return // not sent: keep it ready
          copyNow(link.url!).then(() => toast.success("Link copied"))
          handOut(link)
        }
      )
    } else {
      copyNew()
    }
  }

  function copyAgain(link: InviteLink) {
    if (!link.url) return
    copyNow(link.url)
      .then(() => {
        toast.success("Link copied")
        flash(link.id)
      })
      .catch(() => toast(`Copy this link: ${link.url}`))
  }

  function flash(id: string) {
    setJustCopied(id)
    window.setTimeout(() => setJustCopied((c) => (c === id ? null : c)), 1600)
  }

  async function revoke(id: string) {
    try {
      await api.del(`invite-links/${seg(id)}`)
      links.setData((prev) => ({
        invite_links: (prev?.invite_links ?? []).map((l) => (l.id === id ? { ...l, status: "revoked", url: undefined } : l)),
        referrals: prev?.referrals ?? { joined: 0, needed: 8 },
      }))
      if (limitHit) void prepare()
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
  const all = links.data?.invite_links ?? []
  // The ready link isn't "sent" yet, so it stays out of the list.
  const waiting = all.filter((l) => l.status === "open" && l.id !== ready?.id && (sent.has(l.id) || !l.url))
  const done = all.filter((l) => l.status !== "open")
  const close = () => (window.history.length > 1 ? router.back() : router.push("/friends"))

  return (
    <div className="fixed inset-0 z-10 overflow-y-auto">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={close} className="scrim fixed inset-0 h-full w-full cursor-default" />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-friend-title"
        className="relative mx-auto mt-[8dvh] flex min-h-[92dvh] w-full max-w-[var(--app-max)] flex-col gap-4 rounded-t-sheet bg-sheet px-4 pt-2.5"
        style={{ paddingBottom: "calc(var(--safe-bottom) + 30px)" }}
      >
        <span aria-hidden="true" className="h-[5px] w-10 self-center rounded-[3px] bg-line" />
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <h1 id="add-friend-title" className="m-0 text-[26px] font-black tracking-[-0.03em]">
              Bring your crew
            </h1>
            <p className="m-0 text-[15px] leading-[1.45] text-muted">
              Every tap makes a fresh link for one friend. They open it, sign in with Google, and you&apos;re friends.
            </p>
          </div>
          <button type="button" aria-label="Close" onClick={close} className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-chip">
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-2.5 rounded-card bg-ink p-3.5 text-white">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="flex h-11 w-11 flex-none items-center justify-center rounded-[12px] bg-pink text-[13px] font-extrabold text-ink">
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

        {limitHit ? (
          <p role="alert" className="m-0 rounded-tile bg-warn-bg p-3 text-[14px] font-semibold text-warn">
            {limitHit}
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-2.5">
          <Button onClick={shareNew} disabled={!ready} loading={!ready && preparing}>
            <ShareIcon size={18} strokeWidth={2} /> Share
          </Button>
          <Button variant="outline" onClick={copyNew} disabled={!ready} loading={!ready && preparing}>
            Copy
          </Button>
        </div>
        <span className="-mt-2 text-[12px] text-muted">Each link works once and lasts 14 days.</span>

        <LinkList
          title="Waiting for someone"
          empty="Links you copy or share wait here until a friend joins. You can copy them again."
          loading={links.loading}
          error={links.error && !links.data ? links.error.message : null}
          links={waiting}
          renderAction={(l) =>
            l.url ? (
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" onClick={() => copyAgain(l)} aria-label={`Copy the link made ${madeAt(l.created_at)} again`}>
                  {justCopied === l.id ? <CheckIcon size={16} /> : "Copy"}
                </Button>
                <Button variant="danger" size="sm" onClick={() => revoke(l.id)}>
                  Revoke
                </Button>
              </div>
            ) : (
              <Button variant="danger" size="sm" onClick={() => revoke(l.id)}>
                Revoke
              </Button>
            )
          }
        />

        {done.length > 0 ? (
          <LinkList
            title="Done"
            links={done.slice(0, 20)}
            renderAction={(l) => (
              <span className={cn("rounded-full px-2 py-1 text-[12px] font-bold", l.status === "accepted" ? "bg-pink" : "bg-chip text-muted")}>
                {STATUS[l.status]}
              </span>
            )}
          />
        ) : null}
      </section>
    </div>
  )
}

function LinkList({
  title,
  empty,
  loading,
  error,
  links,
  renderAction,
}: {
  title: string
  empty?: string
  loading?: boolean
  error?: string | null
  links: InviteLink[]
  renderAction: (l: InviteLink) => React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="m-0 text-[13px] font-semibold text-muted">{title}</h2>
      {loading ? (
        <Skeleton className="h-12 rounded-tile" />
      ) : error ? (
        <p className="m-0 text-[14px] text-danger">{error}</p>
      ) : links.length === 0 ? (
        empty ? <div className="rounded-tile border-[1.5px] border-dashed border-dash p-3.5 text-[14px] text-muted">{empty}</div> : null
      ) : (
        <ul className="m-0 flex list-none flex-col rounded-tile bg-white px-3.5 py-0.5">
          {links.map((l) => (
            <li key={l.id} className="flex min-h-[56px] items-center justify-between gap-3 border-b border-line-soft last:border-b-0">
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[14px] font-semibold">
                  {l.accepted_by ? l.accepted_by.name : `Link, ${madeAt(l.created_at)}`}
                </span>
                <span className="text-[12px] text-muted">
                  {l.status === "open"
                    ? `Expires ${formatDayMonth(l.expires_at.slice(0, 10))}`
                    : l.status === "accepted" && l.counts_as_referral
                      ? "Joined, counts towards Pro"
                      : STATUS[l.status]}
                </span>
              </span>
              {renderAction(l)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
