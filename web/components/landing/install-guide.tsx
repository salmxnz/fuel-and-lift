"use client"

// The install walkthrough: three drawn frames per platform showing exactly
// what to tap. Defaults to the visitor's own phone; the toggle switches.
// Styled for the landing page's pink install band.

import Image from "next/image"
import { useState, type ReactNode } from "react"
import { BackIcon, ChevronRightIcon, PlusIcon, ShareIcon } from "@/components/ui/icons"
import { useInstallPlatform } from "@/lib/install"
import { cn } from "@/lib/cn"

type OS = "ios" | "android"

const STEPS: Record<OS, { art: ReactNode; text: ReactNode }[]> = {
  ios: [
    {
      art: <SafariBar />,
      text: (
        <>
          Tap <strong>Share</strong> in Safari. On iOS 26 it sits under <strong>•••</strong>.
        </>
      ),
    },
    {
      art: <Menu rows={["Copy", "Add to Reading List", "Add to Home Screen", "Find on Page"]} pick={2} plus />,
      text: (
        <>
          Scroll down, tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
        </>
      ),
    },
    { art: <HomeScreen />, text: <>Open adebite from your Home Screen and sign in with Google.</> },
  ],
  android: [
    {
      art: <ChromeBar />,
      text: (
        <>
          In Chrome, tap <strong>⋮</strong>. If an <strong>Install</strong> banner pops up, tap that instead.
        </>
      ),
    },
    {
      art: <Menu rows={["New tab", "Bookmarks", "Add to Home screen", "Settings"]} pick={2} />,
      text: (
        <>
          Tap <strong>Add to Home screen</strong>, then <strong>Install</strong>.
        </>
      ),
    },
    { art: <HomeScreen />, text: <>Open adebite from your Home Screen and sign in with Google.</> },
  ],
}

export function InstallGuide() {
  const platform = useInstallPlatform()
  const [choice, setChoice] = useState<OS | null>(null)
  const os: OS = choice ?? (platform === "android" ? "android" : "ios")

  return (
    <div className="flex flex-col gap-8">
      <div className="flex w-fit gap-1 rounded-full bg-white/45 p-1" role="group" aria-label="Phone">
        {(["ios", "android"] as const).map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={os === o}
            onClick={() => setChoice(o)}
            className={cn(
              "min-h-[44px] rounded-full px-5 text-[15px] font-bold transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97]",
              os === o ? "bg-ink text-white" : "text-ink-soft hover:text-ink"
            )}
          >
            {o === "ios" ? "iPhone" : "Android"}
          </button>
        ))}
      </div>

      <ol className="m-0 grid list-none gap-4 p-0 md:grid-cols-3">
        {STEPS[os].map((step, i) => (
          <li key={`${os}-${i}`} className="install-step flex flex-col gap-4" style={{ "--i": i } as React.CSSProperties}>
            <div aria-hidden="true" className="flex aspect-[5/4] items-center justify-center rounded-[22px] bg-white/45 p-6 ring-1 ring-white/70">
              {step.art}
            </div>
            <p className="m-0 flex gap-3 text-[16px] leading-[1.45] text-ink-soft">
              <span className="text-[16px] font-extrabold text-protein">{i + 1}</span>
              <span>{step.text}</span>
            </p>
          </li>
        ))}
      </ol>
    </div>
  )
}

/* ------------------------------------------------------------ Drawn UI */

function Highlight({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("flex items-center justify-center rounded-full bg-pink text-ink shadow-[0_0_0_5px_rgba(168,47,97,0.18)] install-ping", className)}>{children}</span>
}

function SafariBar() {
  return (
    <div className="w-full max-w-[250px] rounded-[20px] bg-white p-3 text-ink">
      <div className="mb-3 rounded-[11px] bg-field py-2 text-center text-[13px] font-semibold text-muted">adebite.com</div>
      <div className="flex items-center justify-between px-2">
        <BackIcon size={20} />
        <ChevronRightIcon size={20} className="opacity-30" />
        <Highlight className="h-10 w-10">
          <ShareIcon size={20} strokeWidth={2} />
        </Highlight>
        <span className="text-[16px] font-extrabold tracking-[0.1em]">•••</span>
      </div>
    </div>
  )
}

function ChromeBar() {
  return (
    <div className="flex w-full max-w-[250px] items-center gap-2 rounded-[20px] bg-white p-3 text-ink">
      <div className="flex-1 rounded-full bg-field px-3 py-2 text-[13px] font-semibold text-muted">adebite.com</div>
      <Highlight className="h-10 w-10 text-[20px] font-extrabold leading-none">⋮</Highlight>
    </div>
  )
}

function Menu({ rows, pick, plus }: { rows: string[]; pick: number; plus?: boolean }) {
  return (
    <ul className="m-0 flex w-full max-w-[250px] list-none flex-col overflow-hidden rounded-[18px] bg-white p-0 text-[14px] text-ink">
      {rows.map((r, i) => (
        <li
          key={r}
          className={cn(
            "flex items-center justify-between px-4 py-2.5",
            i > 0 && "border-t border-line-soft",
            i === pick ? "bg-pink font-bold install-ping-row" : "text-muted"
          )}
        >
          {r}
          {i === pick && plus ? (
            <span className="flex h-5 w-5 items-center justify-center rounded-[5px] border-[1.5px] border-ink">
              <PlusIcon size={12} strokeWidth={2.6} />
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

function HomeScreen() {
  return (
    <div className="grid w-full max-w-[220px] grid-cols-4 gap-x-3 gap-y-3.5">
      {Array.from({ length: 8 }, (_, i) =>
        i === 5 ? (
          <span key={i} className="flex flex-col items-center gap-1">
            <Image src="/icons/icon-192.png" alt="" width={192} height={192} className="install-icon aspect-square w-full rounded-[22%] shadow-[0_0_0_4px_rgba(255,255,255,0.7)]" />
            <span className="text-[10px] font-semibold leading-none text-ink">adebite</span>
          </span>
        ) : (
          <span key={i} className="flex flex-col items-center gap-1">
            <span className="aspect-square w-full rounded-[22%] bg-white/60" />
            <span className="h-[6px] w-3/4 rounded-full bg-white/50" />
          </span>
        )
      )}
    </div>
  )
}
