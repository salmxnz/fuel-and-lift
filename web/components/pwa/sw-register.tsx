"use client"

import { useEffect } from "react"

/**
 * Registers /sw.js once the page has loaded (production and dev). Dev servers
 * reuse chunk names, so they register /sw.js?dev=1, which doesn't cache them.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return
    const register = () => {
      navigator.serviceWorker.register(process.env.NODE_ENV === "production" ? "/sw.js" : "/sw.js?dev=1", { scope: "/" }).catch((err) => {
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
