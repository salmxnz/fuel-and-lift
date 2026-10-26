"use client"

import { useEffect } from "react"
import { ErrorScreen } from "@/components/pwa/error-screen"

// A signed-in screen that crashed, or couldn't load without signal.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])
  return <ErrorScreen error={error} retry={reset} />
}
