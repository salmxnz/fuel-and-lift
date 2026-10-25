/* adebite service worker (hand-written, no build step).
 *
 * - install: precache the app shell (offline page, manifest, icons)
 * - navigations: network first, falling back to the cached offline page;
 *   gym pages (a workout in progress) are also kept, so a basement gym with no
 *   signal still opens the workout (lib/offline-queue.ts syncs it later)
 * - exercise photos (/exercises/*, /exercise-photos/*): cache first, they never change
 * - /_next/static/*: cache first in production (file names are content-hashed);
 *   skipped on localhost/LAN dev servers, where names are reused
 * - API traffic (/api/*) is never cached: it carries the user's data
 * - push: show a notification from the JSON payload {title, body, url}
 * - notificationclick: focus an open window on that url, or open one
 */

const VERSION = "fl-v4"
const SHELL_CACHE = `${VERSION}-shell`
const STATIC_CACHE = `${VERSION}-static`
const MEDIA_CACHE = `${VERSION}-media`
// Signed-in pages; cleared on sign-out (lib/api/query-client.ts clearCache).
const PAGES_CACHE = `${VERSION}-pages`
const KEEP_PAGES = /^\/gym(\/|$)/
const OFFLINE_URL = "/offline"
const IS_DEV = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)|\.local$/.test(self.location.hostname)

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
    const keep = KEEP_PAGES.test(url.pathname)
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (keep && res.ok && !res.redirected) {
            const copy = res.clone()
            event.waitUntil(caches.open(PAGES_CACHE).then((c) => c.put(request, copy)))
          }
          return res
        })
        .catch(async () => {
          const kept = keep ? await caches.match(request, { cacheName: PAGES_CACHE }) : undefined
          if (kept) return kept
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

  if (url.pathname.startsWith("/exercises/") || url.pathname.startsWith("/exercise-photos/")) {
    event.respondWith(
      caches.open(MEDIA_CACHE).then(async (cache) => {
        const hit = await cache.match(request)
        if (hit) return hit
        const res = await fetch(request)
        if (res.ok) cache.put(request, res.clone())
        return res
      })
    )
    return
  }

  // In dev, chunk names stay the same while their contents change, so caching
  // them serves stale JS and CSS. Only production builds get cache-first.
  if (url.pathname.startsWith("/_next/static/") && !IS_DEV) {
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
  const tag = typeof payload.tag === "string" ? payload.tag : undefined
  // "Rest's over" replaces the quiet "resting until…" one and must buzz.
  const rest = !!tag && tag.startsWith("rest-")
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body: typeof payload.body === "string" ? payload.body : "",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag,
        renotify: rest,
        vibrate: rest ? [220, 100, 220] : undefined,
        data: { url },
      }),
      // An open app shows a friend's share as a popup right away (components/share/share-popup.tsx).
      tag && tag.startsWith("share-")
        ? self.clients
            .matchAll({ type: "window", includeUncontrolled: true })
            .then((windows) => windows.forEach((w) => w.postMessage({ type: "share" })))
        : null,
    ])
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
