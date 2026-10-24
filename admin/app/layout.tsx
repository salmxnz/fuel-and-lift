import type { Metadata } from "next"
import localFont from "next/font/local"
import { Providers } from "@/components/providers"
import "./globals.css"

// Schibsted Grotesk (OFL), the PWA's font, self-hosted so builds need no network.
const schibsted = localFont({
  src: [
    { path: "./fonts/schibsted-grotesk-latin-wght-normal.woff2", weight: "400 900", style: "normal" },
    { path: "./fonts/schibsted-grotesk-latin-ext-wght-normal.woff2", weight: "400 900", style: "normal" },
  ],
  variable: "--font-sans",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
})

export const metadata: Metadata = {
  title: { default: "adebite admin", template: "%s · adebite admin" },
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${schibsted.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
