"use client"

import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister"
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client"
import { useState } from "react"
import { CACHE_KEY_PREFIX, getQueryClient } from "@/lib/api/query-client"

const DAY = 24 * 60 * 60 * 1000

/** Bump when cached response shapes change in a way old data would break. */
const CACHE_VERSION = "1"

/** Biggest single response worth saving on the device. */
const MAX_PERSISTED_CHARS = 200_000

let owner: string | null = null

/**
 * The data cache for the signed-in app, saved per user in localStorage so
 * reopening the app shows the last data before the network answers. Signing
 * in as someone else starts from an empty cache.
 */
export function QueryProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [client] = useState(() => {
    const c = getQueryClient()
    if (typeof window !== "undefined") {
      if (owner && owner !== userId) c.clear()
      owner = userId
    }
    return c
  })
  const [persister] = useState(() =>
    createSyncStoragePersister({
      // No storage on the server: the persister does nothing there.
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      key: `${CACHE_KEY_PREFIX}${userId}`,
      throttleTime: 1000,
    })
  )

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: DAY,
        buster: CACHE_VERSION,
        dehydrateOptions: {
          shouldDehydrateQuery: (q) => {
            const key = q.queryKey[0]
            if (q.state.status !== "success" || typeof key !== "string" || key.startsWith("admin/")) return false
            try {
              return JSON.stringify(q.state.data).length <= MAX_PERSISTED_CHARS
            } catch {
              return false
            }
          },
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}
