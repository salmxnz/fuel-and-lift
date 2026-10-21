import type { ReactNode } from "react"

/** Dark full-screen layout used by Login and Join (Join.dc.html). */
export function NightShell({ children }: { children: ReactNode }) {
  return (
    <div className="on-dark min-h-dvh bg-night text-white">
      <main
        className="mx-auto flex min-h-dvh w-full max-w-[var(--app-max)] flex-col gap-6 px-6"
        style={{
          paddingTop: "calc(var(--safe-top) + 56px)",
          paddingBottom: "calc(var(--safe-bottom) + 32px)",
        }}
      >
        <span className="text-[16px] font-extrabold tracking-[-0.01em]">
          Fuel <span className="text-lime">&amp;</span> Lift
        </span>
        {children}
      </main>
    </div>
  )
}

export function Tick() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C8F04D" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

export function GoogleButton({ href, children = "Continue with Google" }: { href: string; children?: ReactNode }) {
  return (
    // A plain link: the OAuth start is a full-page redirect (works in an installed iOS PWA).
    <a
      href={href}
      className="flex min-h-14 items-center justify-center gap-2.5 rounded-btn bg-white text-[16px] font-bold text-ink no-underline"
    >
      <span aria-hidden="true" className="flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-ink text-[13px] font-extrabold">
        G
      </span>
      {children}
    </a>
  )
}
