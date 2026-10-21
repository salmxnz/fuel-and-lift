"use client"

import { useEffect } from "react"

/** Registers /sw.js once the page has loaded (production and dev). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
        console.warn("Service worker registration failed", err)
      })
    }
    if (document.readyState === "complete") register()
    else {
      window.addEventListener("load", register, { once: true })
      return () => window.removeEventListener("load", register)
    }
  }, [])
  return null
}
