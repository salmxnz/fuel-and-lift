// The adebite logo, drawn from docs/brand/logo (bitten "a" + geometric
// wordmark). Regenerate the paths from there if the mark ever changes.

const SYMBOL =
  "M123.85 38.1A28 28 0 0 1 86.13 63.93A28 28 0 0 1 48.07 89.23A88 88 0 0 0 168 204.38L168 212L216 212L216 40L168 40L168 47.62A88 88 0 0 0 123.85 38.1ZM167.95 127.96A40 40 0 1 1 88.05 124.04A40 40 0 1 1 167.95 127.96Z"

const WORDMARK =
  "M596.98 51.07A19 19 0 1 0 559.02 52.93A19 19 0 1 0 596.98 51.07ZM230 202.26L230 208L262 208L262 32L230 32L230 93.74A62 62 0 1 0 230 202.26ZM229.94 149.84A30 30 0 1 1 170.06 146.16A30 30 0 1 1 229.94 149.84ZM450 202.26A62 62 0 1 0 450 93.74L450 32L418 32L418 208L450 208L450 202.26ZM509.94 149.84A30 30 0 1 1 450.06 146.16A30 30 0 1 1 509.94 149.84ZM662 48L630 48L630 88L608 88L608 114L630 114L630 208L662 208L662 114L686 114L686 88L662 88L662 48ZM92 202.26L92 208L124 208L124 88L92 88L92 93.74A62 62 0 1 0 92 202.26ZM91.94 149.84A30 30 0 1 1 32.06 146.16A30 30 0 1 1 91.94 149.84ZM388.86 186.17L363.64 166.47A30 30 0 0 1 313.47 162L400.4 162A62 62 0 1 0 388.86 186.17ZM367.49 136L312.51 136A30 30 0 0 1 367.49 136ZM594 88L562 88L562 208L594 208L594 88ZM808.86 186.17L783.64 166.47A30 30 0 0 1 733.47 162L820.4 162A62 62 0 1 0 808.86 186.17ZM787.49 136L732.51 136A30 30 0 0 1 787.49 136Z"

/** Horizontal lockup: pink symbol (white on pink screens), wordmark in the current text colour. */
export function Logo({ height = 22, onPink = false, className }: { height?: number; onPink?: boolean; className?: string }) {
  return (
    <svg
      viewBox="46 36 738 178"
      height={height}
      width={(height * 738) / 178}
      role="img"
      aria-label="adebite"
      className={className}
    >
      <path className={onPink ? "fill-white" : "fill-pink"} fillRule="evenodd" d={SYMBOL} />
      <path fill="currentColor" fillRule="evenodd" transform="translate(272 34.24) scale(0.62)" d={WORDMARK} />
    </svg>
  )
}

