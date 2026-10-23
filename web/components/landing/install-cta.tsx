"use client"

// The landing page's main button. What it does depends on the visitor:
// Chromium with an install prompt → the browser's own install dialog;
// iPhone Safari → the Share → Add to Home Screen steps; other iOS browsers →
// how to reopen in Safari; Android without a prompt → the menu steps;
// desktop → the web app; already installed → into the app.

import { useState } from "react"
import { toast } from "sonner"
import { Button, ButtonLink } from "@/components/ui/primitives"
import { CheckIcon, ShareIcon } from "@/components/ui/icons"
import { Sheet } from "@/components/ui/sheet"
import { useInstallPlatform, useInstallPrompt } from "@/lib/install"
import { cn } from "@/lib/cn"
import { AndroidSteps, IPhoneSteps, OpenInSafariSteps } from "./install-steps"

type SheetKind = "ios" | "android" | "safari"

const PRESS = "transition-[transform,opacity] duration-150 ease-out active:scale-[0.97]"

export function InstallCta({
  tone = "light",
  align = "start",
  showNote = true,
  fullWidth = false,
}: {
  tone?: "light" | "dark"
  align?: "start" | "center"
  showNote?: boolean
  /** Always stretch the button (inside the install popup). */
  fullWidth?: boolean
}) {
  const platform = useInstallPlatform()
  const { canPrompt, justInstalled, prompt } = useInstallPrompt()
  const [sheet, setSheet] = useState<SheetKind | null>(null)
  const [accepted, setAccepted] = useState(false)

  const variant = tone === "dark" ? "white" : "primary"
  const buttonClass = cn(fullWidth ? "w-full" : "w-full sm:w-auto sm:min-w-[260px]", PRESS)
  const noteClass = cn("m-0 text-[13px] leading-[1.45]", tone === "dark" ? "text-night-muted" : "text-muted")

  let action: React.ReactNode
  let note: React.ReactNode = "Free to start. No App Store, nothing to update."

  if (platform === "installed") {
    action = (
      <ButtonLink href="/today" variant={variant} className={buttonClass}>
        Open adebite
      </ButtonLink>
    )
    note = null
  } else if (accepted || justInstalled) {
    action = (
      <p className={cn("m-0 flex min-h-[56px] items-center gap-2 text-[16px] font-bold", tone === "dark" ? "text-pink" : "text-protein")}>
        <CheckIcon size={20} /> Installed. Open adebite from your Home Screen.
      </p>
    )
    note = null
  } else if (platform === "ios-safari") {
    action = (
      <Button variant={variant} className={buttonClass} onClick={() => setSheet("ios")}>
        <ShareIcon size={20} strokeWidth={2} /> Add to Home Screen
      </Button>
    )
  } else if (platform === "ios-other") {
    action = (
      <Button variant={variant} className={buttonClass} onClick={() => setSheet("safari")}>
        Open in Safari to install
      </Button>
    )
    note = "On iPhone, Safari is the browser that adds apps to your Home Screen."
  } else if (canPrompt) {
    action = (
      <Button variant={variant} className={buttonClass} onClick={async () => setAccepted(await prompt())}>
        Install adebite
      </Button>
    )
  } else if (platform === "android") {
    action = (
      <Button variant={variant} className={buttonClass} onClick={() => setSheet("android")}>
        Add to Home screen
      </Button>
    )
  } else if (platform === "desktop") {
    action = (
      <ButtonLink href="/login" variant={variant} className={buttonClass}>
        Open the web app
      </ButtonLink>
    )
    note = "Best on your phone: open this page there and add it to your Home Screen."
  } else {
    // Server render, before we know the platform: same size, so nothing jumps.
    action = (
      <Button variant={variant} className={buttonClass} aria-hidden tabIndex={-1}>
        Add to Home Screen
      </Button>
    )
  }

  return (
    <div className={cn("flex w-full flex-col gap-2.5", align === "center" ? "items-center text-center" : "items-start")}>
      {action}
      {note && showNote ? <p className={noteClass}>{note}</p> : null}

      <Sheet open={sheet === "ios"} onClose={() => setSheet(null)} title="Add to Home Screen" description="Three taps, and adebite opens like any other app.">
        <IPhoneSteps />
        <Button className={cn("mt-2", PRESS)} onClick={() => setSheet(null)}>
          Got it
        </Button>
      </Sheet>
      <Sheet open={sheet === "android"} onClose={() => setSheet(null)} title="Add to Home screen" description="adebite installs straight from Chrome.">
        <AndroidSteps />
        <Button className={cn("mt-2", PRESS)} onClick={() => setSheet(null)}>
          Got it
        </Button>
      </Sheet>
      <Sheet open={sheet === "safari"} onClose={() => setSheet(null)} title="Open in Safari" description="This browser can't add adebite to your Home Screen. Safari can.">
        <OpenInSafariSteps />
        <Button
          className={cn("mt-2", PRESS)}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(window.location.origin)
              toast.success("Link copied. Now paste it in Safari.")
            } catch {
              toast.error(`Couldn't copy. The address is ${window.location.host}`)
            }
          }}
        >
          Copy link
        </Button>
      </Sheet>
    </div>
  )
}
