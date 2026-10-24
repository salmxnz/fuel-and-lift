import Link from "next/link"
import { ShopIcon } from "@/components/ui/icons"

/** The shop icon in a screen's header: opens the community Shop on a category. */
export function ShopLink({ kind }: { kind: "routine" | "template" | "meal" }) {
  return (
    <Link
      href={`/shop?kind=${kind}`}
      aria-label="Shop: routines, workouts and meals from the community"
      className="flex h-11 w-11 flex-none items-center justify-center rounded-[12px] bg-white text-ink no-underline transition-transform duration-[160ms] ease-out active:scale-[0.97]"
    >
      <ShopIcon size={22} />
    </Link>
  )
}
