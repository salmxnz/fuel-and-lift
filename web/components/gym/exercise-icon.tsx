"use client"

import { useState } from "react"
import { CardioArt, MachineArt } from "@/components/ui/icons"
import type { Exercise } from "@/lib/api/types"
import { cn } from "@/lib/cn"
import { artFor, pixelSrc } from "@/lib/exercise-art"

/**
 * An exercise's picture on a soft pink tile: the gym's own photo when there is
 * one, else its pixel icon (public/pixel, see lib/exercise-art.ts), else the
 * line drawing if the icons aren't installed.
 */
export function ExerciseIcon({
  exercise,
  size = 56,
  wide,
  className,
}: {
  exercise: Pick<Exercise, "name" | "kind" | "equipment" | "gym_photo_url" | "media_url">
  /** Tile size in px (the height, when `wide`). */
  size?: number
  /** Fill the width (a card header) instead of a square tile. */
  wide?: boolean
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const photo = exercise.gym_photo_url || exercise.media_url
  // Pixel art only stays crisp at whole multiples of its 32 px grid.
  const px = Math.max(32, Math.floor((size * 0.78) / 32) * 32)

  return (
    <span
      aria-hidden="true"
      className={cn("flex flex-none items-center justify-center overflow-hidden rounded-tile bg-pink-soft", className)}
      style={{ width: wide ? "100%" : size, height: size }}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- exercise media from the API
        <img src={photo} alt="" className="h-full w-full object-cover" />
      ) : failed ? (
        exercise.kind === "cardio" ? (
          <CardioArt size={Math.round(size * 0.8)} />
        ) : (
          <MachineArt size={Math.round(size * 0.8)} />
        )
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- tiny static pixel art; next/image would smooth it
        <img
          src={pixelSrc(artFor(exercise))}
          alt=""
          width={px}
          height={px}
          draggable={false}
          onError={() => setFailed(true)}
          style={{ imageRendering: "pixelated" }}
        />
      )}
    </span>
  )
}
