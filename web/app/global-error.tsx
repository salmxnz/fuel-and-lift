"use client"

import "./globals.css"
import { ErrorScreen } from "@/components/pwa/error-screen"

// When even the root layout fails: a full reload is the only way back.
export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-GB">
      <body>
        <ErrorScreen error={error} retry={() => window.location.reload()} />
      </body>
    </html>
  )
}
