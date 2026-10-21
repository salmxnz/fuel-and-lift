"use client"

export function OfflineRetry() {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="min-h-[56px] rounded-btn bg-ink text-[16px] font-bold text-white"
    >
      Try again
    </button>
  )
}
