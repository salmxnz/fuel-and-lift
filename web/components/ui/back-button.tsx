"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/cn"
import { BackIcon } from "./icons"

// One back button everywhere (first used in onboarding): a bare 22px chevron
// in a 44px round hit area. -ml-3 lines the chevron's tip up with the content
// below while the tap target stays full size. It presses in a little
// (scale 0.96, 160ms strong ease-out); the tint only shows where hover exists.
const base =
  "-ml-3 flex h-11 w-11 flex-none items-center justify-center rounded-full transition-[transform,background-color] duration-[160ms] ease-out active:scale-[0.96] disabled:invisible"

export function BackButton({
  href,
  onClick,
  label = "Back",
  disabled,
  dark,
  className,
}: {
  /** A path, "history" (browser back, falling back to /today), or omit and pass onClick. */
  href?: string | "history"
  onClick?: () => void
  label?: string
  disabled?: boolean
  /** On dark screens: white chevron and tint. */
  dark?: boolean
  className?: string
}) {
  const router = useRouter()
  const cls = cn(
    base,
    dark ? "text-white hover:bg-white/10 active:bg-white/15" : "text-ink hover:bg-ink/5 active:bg-ink/10",
    className
  )
  if (href && href !== "history") {
    return (
      <Link href={href} aria-label={label} className={cls}>
        <BackIcon size={22} />
      </Link>
    )
  }
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={
        onClick ?? (() => (window.history.length > 1 ? router.back() : router.push("/today")))
      }
      className={cls}
    >
      <BackIcon size={22} />
    </button>
  )
}
