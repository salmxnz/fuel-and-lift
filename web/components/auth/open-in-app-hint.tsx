"use client"

// On a phone's browser (not the Home Screen app), friends who already have
// adebite installed shouldn't have to sign in here: the app keeps its own
// session. Offer to copy the link so they can paste it in the app instead.

import { useState, useSyncExternalStore } from "react"
import { isIOS, isStandalone } from "@/lib/push"

const subscribeNoop = () => () => {}
const onPhoneBrowser = () => !isStandalone() && (isIOS() || /Android/i.test(navigator.userAgent))

export function OpenInAppHint() {
  const show = useSyncExternalStore(subscribeNoop, onPhoneBrowser, () => false)
  const [copied, setCopied] = useState(false)
  if (!show) return null

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-card bg-night-2 p-3.5 text-[14px] leading-[1.45] text-ink">
      <p className="m-0">
        <strong>Already have adebite on your Home Screen?</strong> Copy this link, open the app and paste it in{" "}
        <strong>Me → Friends</strong>. No need to sign in here.
      </p>
      <button
        type="button"
        onClick={() => void copy()}
        className="min-h-[44px] rounded-[12px] border border-night-line text-[15px] font-bold transition-transform duration-150 ease-out active:scale-[0.97]"
      >
        {copied ? "Copied. Now open adebite" : "Copy link"}
      </button>
    </div>
  )
}
