"use client"

// Friend links from Messages/WhatsApp open in the browser, never in the Home
// Screen app (iOS can't hand links to web apps). So the app takes a pasted
// link instead and opens the invite here, where they're already signed in.

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/primitives"

const TOKEN_RE = /^[A-Za-z0-9_-]{4,200}$/

/** The invite token from a pasted link (…/join/abc123) or a bare token. */
export function inviteToken(raw: string): string | null {
  const text = raw.trim()
  const fromUrl = text.match(/\/join\/([A-Za-z0-9_-]{4,200})/)?.[1]
  if (fromUrl) return fromUrl
  return TOKEN_RE.test(text) ? text : null
}

export function PasteInvite() {
  const router = useRouter()
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)

  function open(raw: string) {
    const token = inviteToken(raw)
    if (!token) {
      setError("That doesn't look like an adebite friend link.")
      return
    }
    router.push(`/join/${encodeURIComponent(token)}`)
  }

  async function paste() {
    setError(null)
    try {
      const text = await navigator.clipboard.readText()
      setValue(text)
      if (inviteToken(text)) open(text)
      else setError("The copied text isn't an adebite friend link.")
    } catch {
      setError("Couldn't read the clipboard. Long-press the box and paste instead.")
    }
  }

  return (
    <section aria-labelledby="paste-invite-title" className="flex flex-col gap-2.5 rounded-card bg-white p-3.5">
      <div className="flex flex-col gap-0.5">
        <h2 id="paste-invite-title" className="m-0 text-[15px] font-bold">
          Got a link from a friend?
        </h2>
        <p className="m-0 text-[13px] leading-[1.4] text-muted">Links open in your browser. Paste it here to add them in the app.</p>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          open(value)
        }}
      >
        <label htmlFor="paste-invite" className="sr-only">
          Friend link
        </label>
        <input
          id="paste-invite"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setError(null)
          }}
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="adebite.com/join/…"
          className="min-h-[44px] min-w-0 flex-1 rounded-[12px] border border-line bg-field px-3 text-[15px]"
        />
        {value.trim() ? (
          <Button type="submit" size="sm">
            Open
          </Button>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={() => void paste()}>
            Paste
          </Button>
        )}
      </form>
      {error ? (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </section>
  )
}
