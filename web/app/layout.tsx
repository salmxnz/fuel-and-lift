import type { Metadata, Viewport } from "next"
import localFont from "next/font/local"
import { Toaster } from "sonner"
import { MotionProvider } from "@/components/pwa/motion-provider"
import { ServiceWorkerRegister } from "@/components/pwa/sw-register"
import "./globals.css"

// Schibsted Grotesk (OFL), self-hosted from @fontsource-variable so the
// installed PWA renders correctly offline and the build needs no network.
const schibsted = localFont({
  src: [
    { path: "./fonts/schibsted-grotesk-latin-wght-normal.woff2", weight: "400 900", style: "normal" },
    { path: "./fonts/schibsted-grotesk-latin-ext-wght-normal.woff2", weight: "400 900", style: "normal" },
  ],
  variable: "--font-schibsted",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
})

export const metadata: Metadata = {
  title: { default: "adebite", template: "%s · adebite" },
  description: "Private calorie and gym tracker for you and a few friends.",
  applicationName: "adebite",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    title: "adebite",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  other: {
    // Older iOS/Android Chrome still look for these.
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Stops iOS from auto-zooming into fields (pinch zoom still works).
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#FBEFF3",
  colorScheme: "light",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" className={schibsted.variable}>
      <body>
        <MotionProvider>{children}</MotionProvider>
        <Toaster
          position="top-center"
          offset={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
          toastOptions={{
            duration: 3000,
            style: {
              fontFamily: "var(--font-sans)",
              borderRadius: 14,
              background: "#2E1A24",
              color: "#FFFFFF",
              border: "none",
            },
          }}
        />
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}
