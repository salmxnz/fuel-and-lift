/* adebite service worker (hand-written, no build step).
 *
 * - install: precache the app shell (offline page, manifest, icons)
 * - navigations: network first, falling back to the cached offline page
 * - /_next/static/*: cache first (file names are content-hashed)
 * - API traffic (/api/*) is never cached: it carries the user's data
 * - push: show a notification from the JSON payload {title, body, url}
 * - notificationclick: focus an open window on that url, or open one
 */

const VERSION = "fl-v2"
const SHELL_CACHE = `${VERSION}-shell`
const STATIC_CACHE = `${VERSION}-static`
const OFFLINE_URL = "/offline"

const SHELL = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        // One failing URL must not abort the whole install.
        Promise.all(
          SHELL.map((url) =>
            fetch(url, { cache: "reload", credentials: "same-origin" })
              .then((res) => (res.ok ? cache.put(url, res) : undefined))
              .catch(() => undefined)
          )
        )
      )
      .then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith("/api/")) return

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(SHELL_CACHE)
        const offline = await cache.match(OFFLINE_URL)
        return (
          offline ||
          new Response("<h1>You're offline</h1>", { headers: { "Content-Type": "text/html; charset=utf-8" } })
        )
      })
    )
    return
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(request)
        if (hit) return hit
        const res = await fetch(request)
        if (res.ok) cache.put(request, res.clone())
        return res
      })
    )
    return
  }

  if (SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request))
    )
  }
})

self.addEventListener("push", (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { body: event.data ? event.data.text() : "" }
  }
  const title = typeof payload.title === "string" && payload.title ? payload.title : "adebite"
  const url = typeof payload.url === "string" && payload.url.startsWith("/") ? payload.url : "/today"
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof payload.body === "string" ? payload.body : "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: typeof payload.tag === "string" ? payload.tag : undefined,
      data: { url },
    })
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const target = new URL((event.notification.data && event.notification.data.url) || "/today", self.location.origin)
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        const clientUrl = new URL(client.url)
        if (clientUrl.origin === target.origin && "focus" in client) {
          return client.focus().then((focused) => {
            if (focused && clientUrl.href !== target.href && "navigate" in focused) {
              return focused.navigate(target.href)
            }
            return focused
          })
        }
      }
      return self.clients.openWindow(target.href)
    })
  )
})
