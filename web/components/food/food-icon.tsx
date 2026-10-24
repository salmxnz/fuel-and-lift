"use client"

import { useState } from "react"
import { BarcodeIcon, BowlIcon, StoreIcon } from "@/components/ui/icons"
import type { EntryOrigin } from "@/lib/api/types"
import { cn } from "@/lib/cn"
import { foodIcon, foodIconSrc } from "@/lib/food-icons"

/**
 * A meal's picture on the sand tile: its pixel food icon (public/food, see
 * lib/food-icons.ts), else the line drawing for how it was logged when there's
 * no icon or the pack isn't installed.
 */
export function FoodIconTile({
  icon,
  origin,
  size = 56,
  className,
}: {
  icon: string | null | undefined
  origin?: EntryOrigin
  /** Tile size in px. */
  size?: number
  className?: string
}) {
  const [failed, setFailed] = useState<string | null>(null)
  const known = foodIcon(icon)
  // Pixel art only stays crisp at whole multiples of its 32 px grid.
  const px = Math.max(32, Math.floor((size * 0.78) / 32) * 32)
  const line = Math.round(size * 0.46)

  return (
    <span
      aria-hidden="true"
      className={cn("flex flex-none items-center justify-center rounded-[12px] bg-sand text-sand-ink", className)}
      style={{ width: size, height: size }}
    >
      {known && failed !== known.key ? (
        // eslint-disable-next-line @next/next/no-img-element -- tiny static pixel art; next/image would smooth it
        <img
          src={foodIconSrc(known.key)}
          alt=""
          width={px}
          height={px}
          draggable={false}
          onError={() => setFailed(known.key)}
          style={{ imageRendering: "pixelated" }}
        />
      ) : origin === "restaurant" ? (
        <StoreIcon size={line} strokeWidth={1.6} />
      ) : origin === "barcode" ? (
        <BarcodeIcon size={line} strokeWidth={1.6} />
      ) : (
        <BowlIcon size={line} strokeWidth={1.6} />
      )}
    </span>
  )
}
