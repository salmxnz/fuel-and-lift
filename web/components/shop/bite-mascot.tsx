"use client"

// Bite, the Shop's mascot: the bitten "a" from the logo with a face, little
// legs and a shopping bag. Hops and blinks on its own; tap it and it jumps,
// throws hearts and says something new.

import { useState, type CSSProperties } from "react"
import { SYMBOL } from "@/components/brand/logo"
import { cn } from "@/lib/cn"

const LINES = [
  "Grab a routine. It's free 💸",
  "Psst, the Push Pull Legs slaps 🔥",
  "New week, new gains 💪",
  "Steal your mate's leg day 😈",
  "Add it, tweak it, make it yours",
  "Share yours and get famous ✨",
]

export function BiteMascot({ className, bubble = "tap" }: { className?: string; bubble?: "always" | "tap" }) {
  const [line, setLine] = useState(0)
  const [jump, setJump] = useState(0)
  const showBubble = bubble === "always" || jump > 0

  return (
    <div className={cn("relative", className)}>
      {showBubble ? (
        <p
          key={line}
          aria-live="polite"
          className="bite-say absolute bottom-[92px] right-[56px] z-10 m-0 w-[150px] rounded-[16px] rounded-br-[4px] bg-white px-3 py-2 text-[12.5px] font-bold leading-[1.25] text-ink shadow-[0_8px_20px_rgba(168,47,97,0.16)]"
        >
          {LINES[line]}
        </p>
      ) : null}
      <button
        type="button"
        aria-label="Bite, the Shop mascot. Tap for a tip"
        onClick={() => {
          if (jump > 0) setLine((l) => (l + 1) % LINES.length)
          setJump((j) => j + 1)
        }}
        className="relative h-[104px] w-[92px] flex-none rounded-[20px]"
      >
        <span key={jump} className={cn("absolute inset-0", jump > 0 ? "bite-jump" : "bite-hop")}>
          <BiteDrawing />
        </span>
        {jump > 0
          ? Array.from({ length: 5 }, (_, i) => (
              <span
                key={`${jump}-${i}`}
                aria-hidden="true"
                className="bite-heart absolute left-1/2 top-2 text-[14px]"
                style={{ "--x": `${(i - 2) * 16}px`, "--d": `${i * 40}ms` } as CSSProperties}
              >
                {i % 2 ? "💗" : "✨"}
              </span>
            ))
          : null}
        <span aria-hidden="true" className="bite-shadow absolute bottom-0 left-1/2 h-[8px] w-[56px] -translate-x-1/2 rounded-[50%] bg-[rgba(168,47,97,0.18)]" />
      </button>
    </div>
  )
}

function BiteDrawing() {
  // The "a" sits on top of the legs; its bowl (centre 128,126 r40 on the
  // logo's grid) becomes the face.
  const k = 0.44
  const tx = 4
  const ty = 4
  const fx = 128 * k + tx
  const fy = 126 * k + ty
  return (
    <svg viewBox="0 0 120 136" className="h-full w-full overflow-visible" aria-hidden="true">
      {/* legs */}
      <g>
        <rect x="38" y="88" width="10" height="34" rx="5" fill="#2E1A24" />
        <rect x="66" y="88" width="10" height="34" rx="5" fill="#2E1A24" />
        <ellipse cx="41" cy="124" rx="10" ry="5" fill="#2E1A24" />
        <ellipse cx="73" cy="124" rx="10" ry="5" fill="#2E1A24" />
      </g>
      {/* body: the logo's bitten "a" */}
      <path fill="#EE8FB0" fillRule="evenodd" d={SYMBOL} transform={`translate(${tx + 3} ${ty + 4}) scale(${k})`} />
      <path fill="#F6B8CA" fillRule="evenodd" d={SYMBOL} transform={`translate(${tx} ${ty}) scale(${k})`} />
      {/* face in the bowl of the "a" */}
      <circle cx={fx} cy={fy} r={40 * k} fill="#FDE4EC" />
      <g className="bite-blink" style={{ transformOrigin: `${fx}px ${fy - 3}px` }}>
        <ellipse cx={fx - 6.5} cy={fy - 3} rx="3.2" ry="4.4" fill="#2E1A24" />
        <ellipse cx={fx + 6.5} cy={fy - 3} rx="3.2" ry="4.4" fill="#2E1A24" />
        <circle cx={fx - 5.4} cy={fy - 4.8} r="1.2" fill="#fff" />
        <circle cx={fx + 7.6} cy={fy - 4.8} r="1.2" fill="#fff" />
      </g>
      <ellipse cx={fx - 11.5} cy={fy + 4.5} rx="3.6" ry="2.3" fill="#F28FB0" />
      <ellipse cx={fx + 11.5} cy={fy + 4.5} rx="3.6" ry="2.3" fill="#F28FB0" />
      <path d={`M${fx - 4.5} ${fy + 4}q4.5 4.5 9 0`} stroke="#2E1A24" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      {/* arm and shopping bag */}
      <g className="bite-bag" style={{ transformOrigin: "98px 62px" }}>
        <path d="M97 62q12 4 11 18" stroke="#2E1A24" strokeWidth="4.5" strokeLinecap="round" fill="none" />
        <path d="M98 80h21l-2 26h-17z" fill="#2E1A24" />
        <path d="M102.5 80v-4a6 6 0 0 1 12 0v4" stroke="#F6B8CA" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <path fill="#F6B8CA" fillRule="evenodd" d={SYMBOL} transform="translate(100.5 84) scale(0.075)" />
      </g>
    </svg>
  )
}
