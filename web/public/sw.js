/* adebite service worker (hand-written, no build step).
 *
 * - install: precache the app shell (offline page, manifest, icons)
 * - navigations: network first (a few seconds at most, a basement gym's one
 *   bar of signal must not hang the app), falling back to the copy kept from
 *   the last visit. Every signed-in screen is kept, so the whole app opens
 *   offline and shows the data cached on the phone (components/query-provider.tsx);
 *   changes made offline wait in lib/offline-queue.ts.
 *   A workout started offline has an id no page was kept for: any workout page
 *   serves it (Next reads the id from the address bar, not the HTML).
 * - RSC fetches (client-side navigations): same timeout; failing makes Next
 *   load the page normally, which lands in the navigation handler above
 * - "warm" message: fetch and keep the given pages and the files they load,
 *   so screens not opened yet also work offline (components/pwa/offline-sync.tsx)
 * - exercise photos (/exercises/*, /exercise-photos/*): cache first, they never change
 * - /_next/static/*: cache first in production builds (file names are
 *   content-hashed); skipped by dev servers, which register /sw.js?dev=1
 * - API traffic (/api/*) is never cached: it carries the user's data
 * - push: show a notification from the JSON payload {title, body, url}
 * - notificationclick: focus an open window on that url, or open one
 */

const VERSION = "fl-v5"
const SHELL_CACHE = `${VERSION}-shell`
const STATIC_CACHE = `${VERSION}-static`
const MEDIA_CACHE = `${VERSION}-media`
// Signed-in pages; cleared on sign-out (lib/api/query-client.ts clearCache).
const PAGES_CACHE = `${VERSION}-pages`
const OFFLINE_URL = "/offline"
const IS_DEV = new URL(self.location.href).searchParams.get("dev") === "1"
// How long a navigation waits for the network before using the kept copy.
const NETWORK_TIMEOUT_MS = 3500

const SHELL = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
]

/** Pages that are not kept: signed-out, one-off or redirecting ones. */
const NOT_KEPT = /^\/($|login|onboarding|join\/|api\/|offline|privacy|terms)/

/** The kept page standing in for every page of a dynamic route. */
function shellFor(pathname) {
  const m = pathname.match(/^\/gym\/session\/[^/]+(\/review)?\/?$/)
  if (m) return `/gym/session/_${m[1] || ""}`
  if (pathname === "/") return "/today"
  return null
}

const pageKey = (pathname) => new Request(new URL(pathname, self.location.origin).href)

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

/** fetch, rejecting after ms (the request itself carries on). */
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms)
    promise.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      }
    )
  })
}

function keepPage(pathname, res) {
  if (NOT_KEPT.test(pathname) || !res.ok || res.redirected) return Promise.resolve()
  const type = res.headers.get("content-type") || ""
  if (!type.includes("text/html")) return Promise.resolve()
  return caches.open(PAGES_CACHE).then((c) => c.put(pageKey(pathname), res))
}

async function keptPage(pathname) {
  const cache = await caches.open(PAGES_CACHE)
  const exact = await cache.match(pageKey(pathname))
  if (exact) return exact
  const shell = shellFor(pathname)
  return shell ? cache.match(pageKey(shell)) : undefined
}

async function offlinePage() {
  const cache = await caches.open(SHELL_CACHE)
  const offline = await cache.match(OFFLINE_URL)
  return (
    offline || new Response("<h1>You're offline</h1>", { headers: { "Content-Type": "text/html; charset=utf-8" } })
  )
}

function handleNavigation(event, url) {
  const network = fetch(event.request)
  const kept = network.then((res) => keepPage(url.pathname, res.clone())).catch(() => undefined)
  event.waitUntil(kept)
  return withTimeout(network, NETWORK_TIMEOUT_MS).catch(async () => {
    const hit = await keptPage(url.pathname)
    if (hit) return hit
    // Nothing kept: wait for the network after all, if it's still trying.
    try {
      return await network
    } catch {
      return offlinePage()
    }
  })
}

/** Cache first; misses go to the network and are kept when OK. */
function cacheFirst(cacheName, request) {
  return caches.open(cacheName).then(async (cache) => {
    const hit = await cache.match(request)
    if (hit) return hit
    const res = await fetch(request)
    if (res.ok) cache.put(request, res.clone())
    return res
  })
}

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith("/api/")) return

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(event, url))
    return
  }

  // A client-side navigation: give up quickly so Next falls back to loading
  // the page, which the navigation handler serves from the kept copy.
  if (request.headers.get("RSC") === "1") {
    event.respondWith(withTimeout(fetch(request), NETWORK_TIMEOUT_MS).catch(() => Response.error()))
    return
  }

  if (url.pathname.startsWith("/exercises/") || url.pathname.startsWith("/exercise-photos/")) {
    event.respondWith(cacheFirst(MEDIA_CACHE, request))
    return
  }

  // In dev, chunk names stay the same while their contents change, so caching
  // them serves stale JS and CSS. Only production builds get cache-first.
  if (url.pathname.startsWith("/_next/static/") && !IS_DEV) {
    event.respondWith(cacheFirst(STATIC_CACHE, request))
    return
  }

  if (SHELL.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request)))
  }
})

/** The /_next/static files a page's HTML loads (scripts, styles, fonts). */
function staticAssets(html) {
  const out = new Set()
  const re = /\/_next\/static\/[^"'\s)\\]+/g
  let m
  while ((m = re.exec(html))) out.add(m[0].replace(/&amp;/g, "&"))
  return [...out]
}

/** Fetch and keep pages (and what they load) so they open offline later. */
async function warm(urls) {
  const pages = await caches.open(PAGES_CACHE)
  const statics = IS_DEV ? null : await caches.open(STATIC_CACHE)
  let kept = 0
  for (const u of urls) {
    try {
      const pathname = new URL(u, self.location.origin).pathname
      const res = await fetch(pathname, { credentials: "same-origin", cache: "no-store" })
      if (!res.ok || res.redirected) continue
      const html = await res.clone().text()
      await keepPage(pathname, res)
      kept++
      if (!statics) continue
      await Promise.all(
        staticAssets(html).map(async (asset) => {
          if (await statics.match(asset)) return
          const r = await fetch(asset).catch(() => null)
          if (r && r.ok) await statics.put(asset, r)
        })
      )
    } catch {
      /* offline again or one bad page: keep going */
    }
  }
  return kept
}

self.addEventListener("message", (event) => {
  const data = event.data
  if (!data || data.type !== "warm" || !Array.isArray(data.urls)) return
  const urls = data.urls.filter((u) => typeof u === "string" && u.startsWith("/"))
  event.waitUntil(
    warm(urls).then((kept) => {
      if (event.source) event.source.postMessage({ type: "warmed", kept })
    })
  )
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
