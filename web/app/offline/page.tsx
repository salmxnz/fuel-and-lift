import type { Metadata } from "next"
import { OfflineRetry } from "./retry"
import { Logo } from "@/components/brand/logo"

export const metadata: Metadata = { title: "Offline" }
export const dynamic = "force-static"

// Precached by the service worker and shown when a navigation fails offline.
export default function OfflinePage() {
  return (
    <main className="app-column pb-safe flex min-h-dvh flex-col gap-4">
      <Logo />
      <h1 className="m-0 text-[30px] font-extrabold leading-[1.05] tracking-[-0.02em]">You&apos;re offline</h1>
      <p className="m-0 text-[15px] leading-[1.45] text-muted">
        adebite needs a connection to load your day. Anything you already saved is safe.
      </p>
      <OfflineRetry />
    </main>
  )
}
