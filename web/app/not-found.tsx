import Link from "next/link"

export default function NotFound() {
  return (
    <main className="app-column pb-safe flex min-h-dvh flex-col gap-4">
      <h1 className="m-0 text-[30px] font-extrabold tracking-[-0.02em]">Not here</h1>
      <p className="m-0 text-[15px] text-muted">That page doesn&apos;t exist.</p>
      <Link
        href="/today"
        className="inline-flex min-h-[48px] items-center justify-center rounded-tile bg-ink px-4 font-bold text-white no-underline"
      >
        Back to Today
      </Link>
    </main>
  )
}
