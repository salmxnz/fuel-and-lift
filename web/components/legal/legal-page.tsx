import Link from "next/link"
import type { ReactNode } from "react"
import { Logo } from "@/components/brand/logo"

/** Contact address for privacy and terms questions. */
export const LEGAL_EMAIL = "hello@adebite.com"

/** Shared layout for /privacy and /terms: plain, readable, no app chrome. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="pb-safe mx-auto flex min-h-dvh w-full max-w-[720px] flex-col gap-6 px-5 pt-8 pb-16">
      <Link href="/" aria-label="adebite home" className="self-start">
        <Logo height={24} />
      </Link>
      <header className="flex flex-col gap-1.5">
        <h1 className="m-0 text-[34px] font-extrabold leading-[1.05] tracking-[-0.02em]">{title}</h1>
        <p className="m-0 text-[14px] text-muted">Last updated {updated}</p>
      </header>
      <div className="legal flex flex-col gap-5 text-[16px] leading-[1.6] text-ink-soft">{children}</div>
      <footer className="flex flex-wrap gap-5 border-t border-line pt-5 text-[14px] font-bold">
        <Link href="/" className="no-underline hover:underline">
          Home
        </Link>
        <Link href="/privacy" className="no-underline hover:underline">
          Privacy policy
        </Link>
        <Link href="/terms" className="no-underline hover:underline">
          Terms of service
        </Link>
        <a href={`mailto:${LEGAL_EMAIL}`} className="no-underline hover:underline">
          {LEGAL_EMAIL}
        </a>
      </footer>
    </main>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="m-0 text-[20px] font-extrabold tracking-[-0.01em] text-ink">{title}</h2>
      {children}
    </section>
  )
}
