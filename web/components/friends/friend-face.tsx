// A friend's round face: their photo when they have one, else one of the
// email characters (peach, strawberry, egg), picked from their id so it stays
// the same everywhere.

import type { Person } from "@/lib/api/types"
import { cn } from "@/lib/cn"

const BG = ["#FDE8EF", "#FBDCE6", "#F8E2EA"]

function pick(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h % 3
}

export function FriendFace({ person, size = 44, className }: { person: Person; size?: number; className?: string }) {
  if (person.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote profile photo, small and already sized
      <img
        src={person.avatar_url}
        alt=""
        width={size}
        height={size}
        className={cn("flex-none rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    )
  }
  const k = pick(person.id)
  return (
    <span
      aria-hidden="true"
      className={cn("flex flex-none items-center justify-center overflow-hidden rounded-full", className)}
      style={{ width: size, height: size, background: BG[k] }}
    >
      {k === 0 ? (
        <svg viewBox="0 0 120 124" style={{ width: size * 0.9 }}>
          <circle cx="60" cy="70" r="50" fill="#F2B48C" />
          <ellipse cx="34" cy="82" rx="9" ry="5.5" fill="#F29C9C" />
          <ellipse cx="86" cy="82" rx="9" ry="5.5" fill="#F29C9C" />
          <g stroke="#2E1A24" strokeWidth="5" strokeLinecap="round" fill="none">
            <path d="M34 70q7 7 14 0" />
            <path d="M72 70q7 7 14 0" />
          </g>
          <path d="M62 22c6-12 20-16 30-12-6 10-18 14-30 12z" fill="#A82F61" />
        </svg>
      ) : k === 1 ? (
        <svg viewBox="0 0 100 124" style={{ width: size * 0.8 }}>
          <path d="M50 30c24 0 44 8 44 31 0 27-24 53-44 59C30 114 6 88 6 61 6 38 26 30 50 30z" fill="#EE8FB0" />
          <g stroke="#2E1A24" strokeWidth="5" strokeLinecap="round" fill="none">
            <path d="M30 66q6 6 12 0" />
            <path d="M58 66q6 6 12 0" />
          </g>
          <path
            d="M50 34c-6-9-18-14-30-10 9 3 15 7 17 13-11-2-20 2-24 9 13-2 24-1 32-5 9 4 20 5 34 3-4-7-13-11-24-9 2-6 8-10 17-13-12-4-25 1-30 10z"
            fill="#A82F61"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 120 110" style={{ width: size * 0.9 }}>
          <path
            d="M60 6c16 0 22 10 34 13 14 3 23 15 19 29 7 12 3 28-11 34-6 14-22 22-38 18-14 6-32 0-38-14C10 81 2 66 10 52 4 38 12 22 28 18 35 10 46 6 60 6z"
            fill="#fff"
          />
          <circle cx="62" cy="54" r="21" fill="#F2B48C" />
          <g stroke="#2E1A24" strokeWidth="4" strokeLinecap="round" fill="none">
            <path d="M52 52q4 4 8 0" />
            <path d="M66 52q4 4 8 0" />
          </g>
        </svg>
      )}
    </span>
  )
}
