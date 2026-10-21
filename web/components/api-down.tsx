import Link from "next/link"
import { Logo } from "@/components/brand/logo"

/** Shown by server layouts when the Go API can't be reached. */
export function ApiDownScreen() {
  return (
    <main className="app-column pb-safe flex min-h-dvh flex-col gap-4">
      <Logo />
      <h1 className="m-0 text-[30px] font-extrabold leading-[1.05] tracking-[-0.02em]">Can&apos;t reach the server</h1>
      <p className="m-0 text-[15px] leading-[1.45] text-muted">
        The adebite API isn&apos;t answering right now. Your data is safe. Try again in a moment.
      </p>
      <Link
        href="/today"
        prefetch={false}
        className="inline-flex min-h-[56px] items-center justify-center rounded-btn bg-ink text-[16px] font-bold text-white no-underline"
      >
        Try again
      </Link>
    </main>
  )
}
