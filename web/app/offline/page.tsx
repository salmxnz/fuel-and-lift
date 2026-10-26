import type { Metadata } from "next"
import Link from "next/link"
import { OfflineRetry } from "./retry"
import { Logo } from "@/components/brand/logo"

export const metadata: Metadata = { title: "Offline" }
export const dynamic = "force-static"

// Precached by the service worker and shown when a page that was never kept
// (public/sw.js) is opened offline.
export default function OfflinePage() {
  return (
    <main className="app-column pb-safe flex min-h-dvh flex-col gap-4">
      <Logo />
      <h1 className="m-0 text-[30px] font-extrabold leading-[1.05] tracking-[-0.02em]">You&apos;re offline</h1>
      <p className="m-0 text-[15px] leading-[1.45] text-muted">
        This screen hasn&apos;t been opened on this phone yet. Reconnect once and it&apos;ll work offline next time.
        Anything you already saved is safe.
      </p>
      <OfflineRetry />
      <Link
        href="/today"
        className="inline-flex min-h-[56px] items-center justify-center rounded-btn border border-line bg-surface text-[16px] font-bold text-ink no-underline"
      >
        Go to Today
      </Link>
    </main>
  )
}
